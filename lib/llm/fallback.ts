import { z } from 'zod';
import type { TableData } from '@/types/table';
import type { PageData } from '@/lib/pdf/parser';
import { reconstructRichText } from '@/lib/pdf/richtext';

const LLM_TABLE = z.object({
  headers: z.array(z.string()),
  headerRows: z.array(z.array(z.string())).optional(),
  rows: z.array(z.array(z.string())),
  confidence: z.number().min(0).max(1),
});

const LLM_RESPONSE = z.object({
  tables: z.array(LLM_TABLE),
});

export type LlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type LlmUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type LlmPageResult = {
  tables: TableData[];
  usage?: LlmUsage;
  latencyMs: number;
  error?: string;
};

export function getLlmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
  };
}

export const LLM_CONFIDENCE_THRESHOLD = Number(process.env.LLM_CONFIDENCE_THRESHOLD ?? 0.7);
export const LLM_MAX_PAGES = Number(process.env.LLM_MAX_PAGES ?? 20);
export const LLM_TIME_BUDGET_MS = Number(process.env.LLM_TIME_BUDGET_MS ?? 180_000);

function shouldUseLlmForPage(ruleTables: TableData[], enabled: boolean): boolean {
  if (!enabled || !getLlmConfig()) return false;
  if (ruleTables.length === 0) return true;
  return ruleTables.some((t) => t.confidence < LLM_CONFIDENCE_THRESHOLD || t.warnings.length > 0);
}

function buildPagePrompt(page: PageData, ruleTables: TableData[]): string {
  const cells = page.cells.map((c) => ({
    t: c.text,
    x: Math.round(c.x),
    y: Math.round(c.y),
  }));
  const rowRows: typeof page.cells[] = [];
  const sortedByY = [...page.cells].sort((a, b) => a.y - b.y);
  for (const cell of sortedByY) {
    const row = rowRows.find((r) => Math.abs(r[0].y - cell.y) <= 4);
    if (row) row.push(cell);
    else rowRows.push([cell]);
  }
  const rich = rowRows
    .flatMap((row) => reconstructRichText(row))
    .map((c) => ({ t: c.richText, x: Math.round(c.x), y: Math.round(c.y) }));
  return [
    'Extract ALL tables from this PDF page. Text items have (text, x, y); y increases downward, x increases rightward.',
    'Group items into tables by spatial proximity. Multiple tables may appear side by side or stacked.',
    'Return ONLY JSON: {"tables":[{"headers":["..."],"headerRows":[["..."],["..."]],"rows":[["..."]],"confidence":0.0}]}',
    'Rules: do not invent data; preserve numbers exactly; preserve words exactly including first letters (e.g. CLOAK, not LOAK); if a table has no header, return headers: [] and headerRows: []; include every table you can find.',
    'Multi-level headers: use "headerRows" (array of header lines, each line has EXACTLY the same number of cells as data columns). For a parent header spanning several columns, REPEAT its text in every column it covers (e.g. Diversity over 3 columns -> "Diversity" in all 3 cells of that header line). Use "" for cells the header does not cover. "headers" must be a single flattened line: for each column join non-empty header parts with "/" (e.g. "Diversity/LPIPS").',
    'IMPORTANT: In "Rebuilt text", each element with the same y is ONE cell/column. Do not merge two different elements into one cell, even if they look related. Rebuilt text already merges sub/superscripts (a_{b}, a^{b}), split math symbols (ETT), and multiplied expressions (N_{x}×N_{y}×N_{z}) into single elements — keep them as ONE header, never split them. Map each element to exactly one column by its x position.',
    'CRITICAL: The number of columns is determined by the DATA ROWS (look at how many distinct x positions appear in data rows like numbers), NOT by the header rows. Multi-level headers often span multiple columns and may have FEWER text items than data columns — never shrink the table to match the header. If a header has fewer cells than data rows, pad headers with "" so every row has the SAME column count. NEVER drop a data value (e.g. a rightmost repeated number) just because no header sits above it.',
    'Example (7 columns, 2 header lines): parent "Diversity" covers columns 3-5, "GenEval" col 6, "DPG" col 7, child line "Method|Latency|LPIPS|CLIP|Overall|Overall|Overall". headerRows = [["","","Diversity","Diversity","Diversity","GenEval","DPG"],["Method","Latency","LPIPS","CLIP","Overall","Overall","Overall"]]. headers = ["Method","Latency","Diversity/LPIPS","Diversity/CLIP","Diversity/Overall","GenEval/Overall","DPG/Overall"].',
    'Preserve EVERY character in labels, including math/italic letters like 𝒟, 𝒟_{test}-VQA must keep the 𝒟. Do not drop leading letters or symbols from labels.',
    'Include footnote/statistics rows that sit directly below a table (e.g. "Pearson Correlation: r = 0.9587, p = 0.04129") as a final row of that table. Put the whole text in the first cell and leave other cells empty — never omit it.',
    '',
    `Page number: ${page.pageNumber}`,
    `Page size: ${Math.round(page.width)}x${Math.round(page.height)}`,
    `Rule-engine candidates (may be incomplete or wrong): ${JSON.stringify(ruleTables.map((t) => ({ headers: t.headers, rows: t.rows })))}`,
    `Rebuilt text (sub/superscripts merged): ${JSON.stringify(rich)}`,
    `Raw text items with coordinates: ${JSON.stringify(cells)}`,
  ].join('\n');
}

async function callLlm(prompt: string, config: LlmConfig): Promise<{ content: string; usage?: LlmUsage }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 8000,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`LLM request failed: ${response.status}`);
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Empty LLM response');
    const u = body?.usage;
    const usage: LlmUsage | undefined = u && typeof u.prompt_tokens === 'number'
      ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0 }
      : undefined;
    return { content, usage };
  } finally {
    clearTimeout(timeout);
  }
}

function isProseCell(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  const words = t.split(/\s+/);
  if (words.length < 2) return false;
  return !/\d/.test(t);
}

function isLikelyProse(t: z.infer<typeof LLM_TABLE>): boolean {
  const headerEmpty = t.headers.every((h) => !h.trim());
  if (!headerEmpty) return false;
  const cells = t.rows.flat();
  if (cells.length === 0) return false;
  const proseCount = cells.filter(isProseCell).length;
  return proseCount / cells.length >= 0.5;
}

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
  '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺',
  '∘': '°', 'o': '°',
};

function toSuperscript(s: string): string {
  if (s === '∘' || s === 'o') return '°';
  if (/^[-+]?\d+$/.test(s)) return [...s].map((ch) => SUPERSCRIPT_MAP[ch] ?? ch).join('');
  return s;
}

function normalizeMarkup(text: string): string {
  // Strip PDF control characters used by symbol fonts (e.g. \u0011 for an
  // overline/binom glyph) — they render as invisible/box glyphs in the UI.
  let out = text.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  // Fold chained superscripts: 98.87^{±}^{0.00} -> 98.87^{±0.00}
  out = out.replace(/\^\{([^{}]*)\}\^\{([^{}]*)\}/g, '^{$1$2}');
  return out;
}

// Convert markup to plain text for export/copy (preserves readability).
// Repeatedly strips innermost _{}/^{} pairs so nested markup like m_{DO_{2}} works.
function toPlainText(text: string): string {
  let out = normalizeMarkup(text);
  let prev: string;
  do {
    prev = out;
    out = out.replace(/_\{([^{}]{1,20})\}/g, '$1');
    out = out.replace(/\^\{([^{}]{1,20})\}/g, (_, s: string) => toSuperscript(s));
  } while (out !== prev);
  return out;
}

function trimTrailingEmpty(arr: string[]): string[] {
  const copy = [...arr];
  while (copy.length > 0 && copy[copy.length - 1].trim() === '') copy.pop();
  return copy;
}

function normalizeTable(t: z.infer<typeof LLM_TABLE>): {
  table: z.infer<typeof LLM_TABLE>;
  columnCount: number;
  mergedColumns: number[];
} {
  const clean = (s: string) => (/^column\s+\d+$/i.test(s.trim()) ? '' : normalizeMarkup(s));
  let rows = t.rows.map((row) => row.map(normalizeMarkup)).map(trimTrailingEmpty);
  let headerRows = (t.headerRows ?? [t.headers]).map((hr) => hr.map(clean));
  let headers = t.headers.map(clean);

  const dataCols = Math.max(0, ...rows.map((r) => r.length));
  const colCount = dataCols > 0 ? dataCols : Math.max(headers.length, ...headerRows.map((hr) => hr.length), 0);

  const fit = (arr: string[]) => {
    const a = arr.slice(0, colCount);
    while (a.length < colCount) a.push('');
    return a;
  };
  headerRows = headerRows.map(fit);
  headers = fit(headers);
  const normalizedRows = rows.map(fit);

  // Drop columns empty in every header row and every data row.
  const keepCols: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const headerEmpty = !headers[c]?.trim() && headerRows.every((hr) => !hr[c]?.trim());
    const allRowsEmpty = normalizedRows.every((r) => !r[c]?.trim());
    if (!(headerEmpty && allRowsEmpty)) keepCols.push(c);
  }
  if (keepCols.length > 0 && keepCols.length < colCount) {
    headers = keepCols.map((c) => headers[c]);
    headerRows = headerRows.map((hr) => keepCols.map((c) => hr[c]));
    for (let i = 0; i < normalizedRows.length; i++) normalizedRows[i] = keepCols.map((c) => normalizedRows[i][c]);
  }

  const finalColCount = headers.length;
  headerRows = headerRows.map((hr) => fitTo(hr, finalColCount));

  // Rebuild flattened headers from headerRows: join non-empty parts per column with "/".
  // De-duplicate consecutive repeats (parent text repeated across spanned columns stays in each column).
  if (headerRows.length > 0) {
    headers = Array.from({ length: finalColCount }, (_, c) => {
      const parts = headerRows.map((hr) => hr[c]?.trim() ?? '').filter(Boolean);
      const dedup = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
      return dedup.join('/');
    });
  }

  const mergedColumns: number[] = [];
  if (normalizedRows.length >= 2 && finalColCount > 1) {
    for (let c = 0; c < finalColCount; c++) {
      const first = normalizedRows[0][c]?.trim() ?? '';
      if (!first) continue;
      const restEmpty = normalizedRows.slice(1).every((r) => !r[c]?.trim());
      if (!restEmpty) continue;
      mergedColumns.push(c);
      for (let r = 1; r < normalizedRows.length; r++) normalizedRows[r][c] = first;
    }
  }

  return {
    table: { headers, headerRows, rows: normalizedRows, confidence: t.confidence },
    columnCount: finalColCount,
    mergedColumns,
  };
}

function fitTo(arr: string[], n: number): string[] {
  const a = arr.slice(0, n);
  while (a.length < n) a.push('');
  return a;
}

/**
 * Rebuild multi-level header rows from the PDF's text coordinates.
 *
 * LLMs frequently flatten, merge or mis-align multi-level group headers.
 * Coordinates are deterministic: we locate the first data row, derive column
 * centres from it, then map header text (with sub/superscripts reconstructed)
 * back onto those columns. Group labels spanning several columns are repeated
 * so the renderer's colSpan logic can merge them; vertically-centred labels
 * are written into every line they visually span so rowSpan can merge them.
 *
 * Returns null unless the data row can be grouped into exactly `colCount`
 * columns and at least one header label maps successfully (conservative).
 */
function rebuildHeaderRowsFromCoords(
  page: PageData,
  firstDataRow: string[],
  colCount: number
): string[][] | null {
  if (colCount < 2) return null;

  // Locate the data row via the most distinctive cell: among the row's values,
  // pick one whose text appears fewest times on the page, then take its
  // topmost occurrence. Superscript labels are split into fragments in the
  // PDF and won't match, but numeric values usually appear as single items.
  const matches = firstDataRow
    .map((v) => v.trim())
    .filter(Boolean)
    .map((text) => ({ text, cells: page.cells.filter((c) => c.text.trim() === text) }))
    .filter((m) => m.cells.length > 0)
    .sort((a, b) => a.cells.length - b.cells.length);
  if (!matches.length) return null;
  const anchor = matches[0].cells.reduce((a, b) => (a.y < b.y ? a : b));
  const dataY = anchor.y;

  const sorted = [...page.cells].filter((c) => c.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);

  // Cluster cells into visual rows. Use a tighter tolerance for the data row but
  // a looser one (8pt) above it so split sub/superscripts stay in the same line.
  const cluster = (tolerance: number) => {
    const rows: (typeof page.cells)[] = [];
    for (const cell of sorted) {
      const row = rows.find((r) => Math.abs(r[0].y - cell.y) <= tolerance);
      if (row) row.push(cell); else rows.push([cell]);
    }
    return rows;
  };
  const dataRow = cluster(4).find((r) => r.some((c) => c === anchor || Math.abs(c.y - dataY) <= 4));
  if (!dataRow) return null;

  // Derive column centres from the data row: fragments in the same column
  // (e.g. "×" + "1.0000") have close x origins; distinct columns are farther.
  const dataCells = [...dataRow].sort((a, b) => a.x - b.x);
  const groups: { left: number; right: number; lastX: number }[] = [];
  for (const cell of dataCells) {
    const last = groups[groups.length - 1];
    if (last && cell.x - last.lastX <= 15) {
      last.right = Math.max(last.right, cell.x + cell.width);
      last.lastX = cell.x;
    } else {
      groups.push({ left: cell.x, right: cell.x + cell.width, lastX: cell.x });
    }
  }
  if (groups.length !== colCount) return null;
  const centers = groups.map((g) => (g.left + g.right) / 2);

  // Header visual rows above the data row, using 8pt tolerance for sub/superscripts.
  const allHeaderRows = cluster(8).filter(
    (r) => r.every((c) => c.y < dataY - 4) && dataY - r[0].y < 60
  );
  if (!allHeaderRows.length) return null;

  const rowLines = allHeaderRows.map((vr) => {
    const rich = reconstructRichText(vr).filter((c) => c.richText.trim());
    const line = Array.from({ length: colCount }, () => '');
    let mapped = false;
    for (const cell of rich) {
      const text = normalizeMarkup(cell.richText);
      if (!text) continue;
      const left = cell.x;
      const right = cell.x + cell.width;
      // Columns whose centre falls inside the label's horizontal extent are
      // covered by it — repeat the text so colSpan can merge them later.
      const coveredCols: number[] = [];
      for (let c = 0; c < colCount; c++) {
        if (centers[c] >= left - 12 && centers[c] <= right + 12) coveredCols.push(c);
      }
      if (coveredCols.length) {
        for (const c of coveredCols) line[c] = text;
        mapped = true;
        continue;
      }
      // Otherwise snap to the nearest column centre.
      let nearest = -1;
      let bestDist = Infinity;
      for (let c = 0; c < colCount; c++) {
        const d = Math.abs(centers[c] - (left + (right - left) / 2));
        if (d < bestDist) { bestDist = d; nearest = c; }
      }
      if (nearest >= 0 && bestDist <= 45 && !line[nearest]) {
        line[nearest] = text;
        mapped = true;
      }
    }
    return { line, mapped, rich };
  });

  if (!rowLines.some((r) => r.mapped)) return null;

  const rebuilt = rowLines.map((r) => r.line);

  // Expand parent group labels across the columns they own. A centred label
  // like "k=2" has a text width far smaller than the 4 columns it spans, so
  // coordinate extent alone under-covers it. When a header line has several
  // sparse labels and the line below has many cells, distribute the child
  // columns evenly among the parent labels, starting after any leading
  // row-spanning label column (parent empty, child filled in col 0).
  for (let ri = 0; ri < rebuilt.length - 1; ri++) {
    const cur = rebuilt[ri];
    const child = rebuilt[ri + 1];
    const labels: { text: string; c: number; x: number }[] = [];
    for (let c = 0; c < colCount; c++) {
      if (cur[c]) labels.push({ text: cur[c], c, x: centers[c] });
    }
    // Collapse consecutive duplicates (already repeated for colSpan) to unique labels.
    const unique = labels.filter((l, i) => i === 0 || l.text !== labels[i - 1].text);
    if (unique.length < 2) continue;
    if (child.filter(Boolean).length <= unique.length) continue;

    // Only the first leading empty-parent/filled-child column is a row-spanning
    // label column (e.g. "d"); later empty columns belong to the first group.
    const startCol = !cur[0] && child[0] ? 1 : 0;
    const available = colCount - startCol;
    if (available < unique.length * 2) continue;

    const span = Math.floor(available / unique.length);
    const expected = unique.map((_, i) => ({
      text: unique[i].text,
      from: startCol + i * span,
      to: i === unique.length - 1 ? colCount - 1 : startCol + (i + 1) * span - 1,
    }));
    // Only apply when each label's original column lies inside its span (centred
    // labels map to the middle column, which is inside the span).
    if (!expected.every((e, i) => unique[i].c >= e.from && unique[i].c <= e.to)) continue;

    const fresh = Array.from({ length: colCount }, () => '');
    for (const e of expected) for (let c = e.from; c <= e.to; c++) fresh[c] = e.text;
    // Preserve leading row-spanning label columns and any other columns outside spans.
    for (let c = 0; c < startCol; c++) fresh[c] = child[c] ? '' : cur[c];
    for (let c = 0; c < colCount; c++) if (!fresh[c]) fresh[c] = cur[c];
    rebuilt[ri] = fresh;
  }

  // A label appearing alone on a single visual row (e.g. Method/Latency) is a
  // vertically-centred row-spanning label: copy it into adjacent header lines
  // so rowSpan detection merges it. Detect rows whose mapped cells are a strict
  // subset of both neighbours' columns.
  const occupied = (line: string[]) => line.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  for (let ri = 1; ri < rebuilt.length - 1; ri++) {
    const cur = occupied(rebuilt[ri]);
    const prev = occupied(rebuilt[ri - 1]);
    const next = occupied(rebuilt[ri + 1]);
    const isSubset = (a: number[], b: number[]) => a.length > 0 && a.length < b.length && a.every((c) => b.includes(c));
    if (isSubset(cur, prev) && isSubset(cur, next)) {
      for (const c of cur) {
        rebuilt[ri - 1][c] = rebuilt[ri][c];
        rebuilt[ri + 1][c] = rebuilt[ri][c];
      }
    }
  }

  return rebuilt;
}

export async function extractPageWithLlm(
  page: PageData,
  ruleTables: TableData[],
  config: LlmConfig
): Promise<LlmPageResult> {
  const started = Date.now();
  if (!shouldUseLlmForPage(ruleTables, true)) {
    return { tables: ruleTables, latencyMs: 0 };
  }
  try {
    const { content, usage } = await callLlm(buildPagePrompt(page, ruleTables), config);
    let parsed: z.infer<typeof LLM_RESPONSE>;
    try {
      parsed = LLM_RESPONSE.parse(JSON.parse(content));
    } catch (e) {
      const reason = e instanceof Error ? e.message.slice(0, 200) : 'unknown';
      return {
        tables: ruleTables,
        usage,
        latencyMs: Date.now() - started,
        error: `LLM output failed validation (${reason}); kept rule-based result. Raw: ${content.slice(0, 300)}`,
      };
    }
    const pageTables: TableData[] = parsed.tables.filter((t) => !isLikelyProse(t)).map((t, i) => {
      const { table: n, columnCount, mergedColumns } = normalizeTable(t);
      const warnings = ['AI assisted extraction; please review'];
      if (mergedColumns.length) {
        warnings.push(
          `Merged cells filled down in column ${mergedColumns.map((c) => c + 1).join(', ')}; please verify`
        );
      }

      let headerRows = n.headerRows ?? [];
      let headers = n.headers;
      const rebuilt = rebuildHeaderRowsFromCoords(page, n.rows[0] ?? [], columnCount);
      if (rebuilt && rebuilt.some((hr) => hr.some((v) => v.trim()))) {
        headerRows = rebuilt;
        headers = Array.from({ length: columnCount }, (_, c) => {
          const parts = headerRows.map((hr) => hr[c]?.trim() ?? '').filter(Boolean);
          const dedup = parts.filter((p, idx) => idx === 0 || p !== parts[idx - 1]);
          return dedup.join('/');
        });
        warnings.push('Group headers rebuilt from PDF text coordinates; please verify');
      }

      return {
        id: `table_llm_${page.pageNumber}_${i + 1}`,
        page: page.pageNumber,
        rowCount: n.rows.length,
        columnCount,
        headers: headers.map(toPlainText),
        rows: n.rows.map((row) => row.map(toPlainText)),
        headersRich: headers,
        rowsRich: n.rows,
        headerRows: headerRows.map((hr) => hr.map(toPlainText)),
        headerRowsRich: headerRows,
        confidence: n.confidence,
        source: 'llm' as const,
        warnings,
      };
    });
    return { tables: pageTables, usage, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      tables: ruleTables,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'Unknown LLM error',
    };
  }
}

export async function extractPagesWithLlm(
  pages: PageData[],
  ruleTablesByPage: Map<number, TableData[]>,
  config: LlmConfig,
  enabled = true
): Promise<{ tables: TableData[]; usage: LlmUsage[]; latencyMs: number; errors: string[] }> {
  const started = Date.now();
  const usage: LlmUsage[] = [];
  const errors: string[] = [];
  const all: TableData[] = [];

  let llmPageCount = 0;
  for (const page of pages) {
    const ruleTables = ruleTablesByPage.get(page.pageNumber) ?? [];
    if (!enabled || !shouldUseLlmForPage(ruleTables, enabled)) {
      all.push(...ruleTables);
      continue;
    }
    if (llmPageCount >= LLM_MAX_PAGES || Date.now() - started > LLM_TIME_BUDGET_MS) {
      all.push(...ruleTables);
      errors.push(`page ${page.pageNumber}: AI skipped (page or time budget reached); rule-based result kept`);
      continue;
    }
    llmPageCount += 1;
    const result = await extractPageWithLlm(page, ruleTables, config);
    if (result.error) errors.push(`page ${page.pageNumber}: ${result.error}`);
    if (result.usage) usage.push(result.usage);
    if (result.tables.length > 0) all.push(...result.tables);
    else all.push(...ruleTables);
  }

  return { tables: all, usage, latencyMs: Date.now() - started, errors };
}

export async function enhanceWithLlm(
  table: TableData,
  page: PageData,
  config: LlmConfig
): Promise<TableData> {
  const prompt = [
    'You are a PDF table extraction assistant. Correct the given table using raw text coordinates.',
    'Return ONLY JSON: {"tables":[{"headers":["..."],"rows":[["..."]],"confidence":0.0}]}',
    'Do not invent data.',
    '',
    `Rule-based headers: ${JSON.stringify(table.headers)}`,
    `Rule-based rows: ${JSON.stringify(table.rows)}`,
    `Raw cells: ${JSON.stringify(page.cells.map((c) => ({ text: c.text, x: Math.round(c.x), y: Math.round(c.y) })))}`,
  ].join('\n');

  try {
    const { content } = await callLlm(prompt, config);
    let parsed: z.infer<typeof LLM_RESPONSE>;
    try {
      parsed = LLM_RESPONSE.parse(JSON.parse(content));
    } catch {
      return { ...table, warnings: [...table.warnings, 'AI correction failed validation; kept rule-based result'] };
    }
    const candidate = parsed.tables[0];
    if (!candidate) {
      return { ...table, warnings: [...table.warnings, 'AI returned no table; kept rule-based result'] };
    }
    const conflict = JSON.stringify(candidate.rows) !== JSON.stringify(table.rows);
    const warnings = [...table.warnings];
    if (conflict) warnings.push('AI result differs from rule-based extraction; please review');
    return {
      ...table,
      headers: candidate.headers,
      rows: candidate.rows,
      rowCount: candidate.rows.length,
      columnCount: candidate.headers.length || (candidate.rows[0]?.length ?? table.columnCount),
      confidence: Math.min(table.confidence, candidate.confidence),
      source: 'hybrid',
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ...table, warnings: [...table.warnings, `AI correction unavailable: ${message}`] };
  }
}
