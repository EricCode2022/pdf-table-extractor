import { z } from 'zod';
import type { TableData } from '@/types/table';
import type { PageData } from '@/lib/pdf/parser';
import { reconstructRichText } from '@/lib/pdf/richtext';

const LLM_TABLE = z.object({
  headers: z.array(z.string()),
  headerRows: z.array(z.array(z.string())).optional(),
  rows: z.array(z.array(z.string())),
  // Models sometimes omit this field; it must never invalidate a whole page.
  confidence: z.number().min(0).max(1).default(0.8),
});

const LLM_RESPONSE = z.object({
  tables: z.array(LLM_TABLE),
});

/** Parse LLM JSON, salvaging complete table objects from a truncated reply. */
function parseLlmJson(content: string): unknown {
  try { return JSON.parse(content); } catch { /* try salvage */ }
  const trimmed = content.trim();
  // Find the "tables" array, then keep only complete top-level objects inside
  // it. A truncated final object is dropped rather than failing the page.
  const marker = trimmed.indexOf('"tables"');
  const open = trimmed.indexOf('[', marker < 0 ? 0 : marker);
  if (open < 0) return null;
  const objects: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = open + 1; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) { objects.push(trimmed.slice(start, i + 1)); start = -1; }
      if (depth < 0) break;
    }
  }
  if (!objects.length) return null;
  return { tables: objects.map((o) => { try { return JSON.parse(o); } catch { return null; } }).filter(Boolean) };
}

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
    'CRITICAL: Scan the ENTIRE page from TOP (small y) to BOTTOM (large y). Do NOT stop after finding a few tables — a dense page may contain 6 or more tables. Continue scanning to the very bottom and include EVERY table, including ones near the page bottom.',
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
  const cells = t.rows.flat().map((v) => v?.trim() ?? '').filter(Boolean);
  if (cells.length === 0) return false;
  // A real table's data rows contain numbers or short labels. A paragraph
  // misread as a table has only multi-word sentences with no digits.
  if (cells.some((v) => /\d/.test(v))) return false;
  const proseCount = cells.filter(isProseCell).length;
  return proseCount / cells.length >= 0.6;
}

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
  '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺',
  '∘': '°', 'o': '°', '†': '⁺',
};

function toSuperscript(s: string): string {
  if (s === '∘' || s === 'o') return '°';
  if (s === '†') return '⁺';
  if (/^[-+]?\d+$/.test(s)) return [...s].map((ch) => SUPERSCRIPT_MAP[ch] ?? ch).join('');
  return s;
}

// Symbol fonts often map math glyphs into the Private Use Area, which normal
// fonts render as tofu boxes. Map the ones we have observed to Unicode math.
const PUA_SYMBOL_MAP: Record<string, string> = {
  '\uE23B': '𝒪', // mathematical script capital O (Big-O)
};

function normalizeMarkup(text: string): string {
  // Strip PDF control characters used by symbol fonts (e.g. \u0011 for an
  // overline/binom glyph) — they render as invisible/box glyphs in the UI.
  let out = text.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  for (const [pua, unicode] of Object.entries(PUA_SYMBOL_MAP)) {
    out = out.split(pua).join(unicode);
  }
  // Some PDFs use a dagger glyph for a superscript plus (e.g. "77.9^+").
  out = out.replace(/†/g, '+');
  // Fold chained superscripts repeatedly: ε^{−2}^{k/}^{(2σ}^{+k}^{)} ->
  // ε^{−2k/(2σ+k)}. PDF symbol fonts split one superscript into many runs.
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\^\{([^{}]*)\}\^\{([^{}]*)\}/g, '^{$1$2}');
  } while (out !== prev);
  return out;
}

// Convert markup to plain text for export/copy (preserves readability).
// Repeatedly strips innermost _{}/^{} pairs so nested markup like m_{DO_{2}} works.
function toPlainText(text: string): string {
  let out = normalizeMarkup(text).replace(/\\binom\{([^{}]*)\}\{([^{}]*)\}/g, 'C($1,$2)');
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
  dataRows: string[][],
  colCount: number,
  llmHeaderRows: string[][] = []
): string[][] | null {
  if (colCount < 2) return null;

  // Locate the first true data row via a distinctive cell from the early rows.
  // Prefer numeric values: an LLM may put a row-spanning text label in the
  // first row by mistake, which would anchor one line too high and pull prose
  // from above the table into the header.
  const isNumeric = (s: string) => /^[\d.,%+\-]+$/.test(s);
  const candidates = dataRows.slice(0, 3).flat().map((v) => v.trim()).filter(Boolean);
  const matches = candidates
    .map((text) => ({ text, cells: page.cells.filter((c) => c.text.trim() === text) }))
    .filter((m) => m.cells.length > 0)
    // Prefer numeric values over text labels: an LLM may put a row-spanning
    // text label (e.g. "ResNet-18") in the first data row by mistake, which
    // would anchor the header detector one line too high and pull in prose.
    .sort((a, b) =>
      Number(isNumeric(b.text)) - Number(isNumeric(a.text)) || a.cells.length - b.cells.length
    );
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
  // A restored leading multirow label column has no text in the first data
  // row (the label is vertically centred lower), so the PDF row yields one
  // fewer centre than the table's column count. Insert a virtual centre for
  // that column to the left of the first real one.
  if (groups.length === colCount - 1 && colCount >= 2) {
    const first = (groups[0].left + groups[0].right) / 2;
    const gap = groups.length > 1 ? first - (groups[1].left + groups[1].right) / 2 : 30;
    groups.unshift({ left: first - gap, right: first - gap, lastX: first - gap });
  }
  if (groups.length !== colCount) return null;
  const centers = groups.map((g) => (g.left + g.right) / 2);

  const allHeaderRows = cluster(10).filter(
    (r) => r.every((c) => c.y < dataY - 4) && dataY - r[0].y < 60
  );
  if (!allHeaderRows.length) return null;

  const rowLines = allHeaderRows.map((vr) => {
    let rich = reconstructRichText(vr).filter((c) => c.richText.trim());
    // Fuse neighbouring fragments that belong to one glyph group (e.g. the
    // radical "√" sitting a few points above "s_{NN}"). reconstructRichText
    // only merges within a strict y band; header symbols are often offset.
    const fused: typeof rich = [];
    for (const cell of [...rich].sort((a, b) => a.x - b.x || a.y - b.y)) {
      const last = fused[fused.length - 1];
      if (last && cell.x - (last.x + last.width) <= 4 && Math.abs(cell.y - last.y) <= 10) {
        // A single letter followed by a small digit is a binomial coefficient
        // (d over 2). Preserve it as \binom markup for rich rendering.
        if (/^[A-Za-z]$/.test(last.richText) && /^\d$/.test(cell.richText)) {
          last.richText = `\\binom{${last.richText}}{${cell.richText}}`;
        } else {
          last.richText += cell.richText;
        }
        last.width = cell.x + cell.width - last.x;
        last.y = Math.min(last.y, cell.y);
      } else {
        fused.push({ ...cell });
      }
    }
    rich = fused;
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
        // Tight tolerance: a narrow label (e.g. "Other") must not spill into a
        // neighbouring column. Wide group labels still cover several centres.
        if (centers[c] >= left && centers[c] <= right) coveredCols.push(c);
      }
      if (coveredCols.length > 1) {
        // Wide parent group label spanning several columns: repeat it.
        for (const c of coveredCols) line[c] = text;
        mapped = true;
        continue;
      }
      // Narrow label: snap to the nearest column centre and append rather than
      // overwrite — multiple fragments (e.g. "log" + "d_{2}") share one cell.
      let nearest = -1;
      let bestDist = Infinity;
      for (let c = 0; c < colCount; c++) {
        const d = Math.abs(centers[c] - (left + (right - left) / 2));
        if (d < bestDist) { bestDist = d; nearest = c; }
      }
      if (nearest >= 0 && bestDist <= 45) {
        line[nearest] = line[nearest] ? line[nearest] + text : text;
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

  // A repeated parent group (e.g. "T(Eq.)" over 4 Eq. columns) may not cover
  // every child column the LLM happened to leave blank in the parent line.
  // Extend each repeated group label across the contiguous child-filled span
  // that contains its existing columns.
  for (let ri = 0; ri < rebuilt.length - 1; ri++) {
    const cur = rebuilt[ri];
    const child = rebuilt[ri + 1];
    const counts = new Map<string, number>();
    for (const v of cur) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const [groupText, count] of counts) {
      if (count < 2) continue;
      const cols = cur.map((v, c) => (v === groupText ? c : -1)).filter((c) => c >= 0);
      const anchorCol = Math.min(...cols);
      // Find the run of identical child labels containing the anchor column.
      const childText = child[anchorCol];
      if (!childText) continue;
      let from = anchorCol;
      while (from > 0 && child[from - 1] === childText) from--;
      let to = anchorCol;
      while (to + 1 < colCount && child[to + 1] === childText) to++;
      // Only a run of 3+ identical child labels is a colSpan group; require at
      // least half of its parent cells to already carry the repeated label.
      const runLen = to - from + 1;
      if (runLen < 3) continue;
      const inRun = cols.filter((c) => c >= from && c <= to).length;
      if (inRun / runLen < 0.5) continue;
      for (let c = from; c <= to; c++) cur[c] = groupText;
    }
  }

  // Extend an isolated parent label rightwards over empty parent cells that
  // have child values (e.g. "Proof" over Lemma/Target). A centred group label's
  // text width is smaller than the columns it spans, so the x-extent mapping
  // only anchors its first column.
  for (let ri = 0; ri < rebuilt.length - 1; ri++) {
    // Only the top parent row can contain colSpan group labels. Lower rows may
    // hold vertically-centred row-spanning labels (e.g. β) which must not be
    // spread sideways into the child columns.
    if (ri > 0) break;
    const cur = rebuilt[ri];
    // Use the densest following line as the child reference: a middle visual
    // row may be a sparse row-spanning label (β) rather than the child columns.
    let child = rebuilt[ri + 1];
    for (let r = ri + 2; r < rebuilt.length; r++) {
      if (rebuilt[r].filter(Boolean).length > child.filter(Boolean).length) child = rebuilt[r];
    }
    // Find the anchor column of each distinct label.
    const anchors: { c: number; text: string }[] = [];
    for (let c = 0; c < colCount; c++) {
      if (cur[c] && !anchors.some((a) => a.text === cur[c])) anchors.push({ c, text: cur[c] });
    }
    // Process right-to-left so a right group claims its left columns before
    // the left group extends rightwards. A column filled on every lower line
    // is a row-spanning label column (e.g. β) and is a hard boundary.
    const rowSpanCols: number[] = [];
    if (rebuilt.length - ri >= 3) {
      for (let c = 0; c < colCount; c++) {
        if (rebuilt.slice(ri + 1).every((line) => line[c])) rowSpanCols.push(c);
      }
    }
    for (const a of [...anchors].reverse()) {
      if (child[a.c] === a.text) continue;
      for (const dir of [-1, 1]) {
        for (let c = a.c + dir; c >= 0 && c < colCount; c += dir) {
          if (cur[c] || !child[c] || rowSpanCols.includes(c)) break;
          cur[c] = a.text;
        }
      }
    }
  }

  // Copy parent labels down into empty child cells so rowSpan merges them
  // (e.g. "#Tasks"/"2L(m)" spanning both header lines). The label was printed
  // only once in the PDF, vertically centred across the header lines.
  for (let ri = 0; ri < rebuilt.length - 1; ri++) {
    const cur = rebuilt[ri];
    const child = rebuilt[ri + 1];
    // Don't fill a row-spanning label line (e.g. β between parent/child rows)
    // with parent group labels; it represents one tall merged cell, not a
    // separate header line with its own group labels.
    const curCount = cur.filter(Boolean).length;
    const childCount = child.filter(Boolean).length;
    // A sparse line between two denser lines is a vertically-centred row-span
    // label line (e.g. β), not a group row to copy down.
    const isSpanLine = curCount > 0 && curCount < childCount / 2;
    if (isSpanLine) continue;
    for (let c = 0; c < colCount; c++) {
      if (cur[c] && !child[c]) child[c] = cur[c];
    }
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

  // Two full header lines with no rowSpan relationship are two lines of the
  // same row-spanning cells (e.g. "colliding"/"nuclei", "√sNN"/"TeV"). Join
  // them into the first line; columns repeated across the first line are
  // parent group labels (colSpan) and keep their child line as-is.
  if (rebuilt.length === 2) {
    const [top, bottom] = rebuilt;
    const allFilled = top.every(Boolean) && bottom.every(Boolean);
    const hasRowSpan = top.some((text, c) => text && text === bottom[c]);
    if (allFilled && !hasRowSpan) {
      for (let c = 0; c < colCount; c++) {
        if (top.filter((t) => t === top[c]).length > 1) continue; // parent colSpan
        const joined = `${top[c]} ${bottom[c]}`;
        top[c] = joined;
        bottom[c] = joined; // repeat so rowSpan merges into one tall cell
      }
    }
  }

  // Restore row-spanning labels that appear in BOTH LLM header lines but only
  // once in the PDF (e.g. "#Tasks"/"Spec"/"Other" printed once, spanning both
  // lines). Without this, coordinate rebuilding puts them only in the parent
  // line and the child line loses those columns.
  if (llmHeaderRows.length >= 2) {
    for (let c = 0; c < colCount; c++) {
      const llmText = llmHeaderRows[0][c]?.trim() ?? '';
      if (!llmText) continue;
      const spansRows = llmHeaderRows.slice(1).some((hr) => (hr[c]?.trim() ?? '') === llmText);
      if (!spansRows) continue;
      for (let ri = 0; ri < rebuilt.length; ri++) {
        if (!rebuilt[ri][c]) rebuilt[ri][c] = llmText;
      }
    }
  }

  return rebuilt;
}

/**
 * Split side-by-side tables that the LLM merged into one and headed with prose
 * from above (e.g. two 3-column tables P1/P2/P3 and ≻a/≻b/≻c). Uses raw text
 * items: a small x gap (<7pt) means glyph fragments of one column, a large gap
 * (>30pt) means a different sub-table.
 */
function splitSideBySideTables(page: PageData, table: TableData): TableData[] | null {
  const colCount = table.columnCount;
  const rows = table.rows;
  if (colCount < 4 || rows.length < 2) return null;
  const firstHeader = table.headers[0]?.trim() ?? '';
  // Prose header: long, multi-word, no digits and located far above the data.
  if (firstHeader.length < 25 || !/\s/.test(firstHeader) || /\d/.test(firstHeader)) return null;
  const prose = page.cells.find((c) => c.text.trim() === firstHeader);
  if (!prose) return null;

  // First data row y: use the last row's numeric text (least likely to be a header digit).
  const numeric = [...rows[0]].reverse().find((v) => /\d/.test(v ?? ''))?.trim() ?? '';
  const anchor = page.cells
    .filter((c) => c.text.trim() === numeric && c.y > prose.y + 10)
    .sort((a, b) => b.y - a.y)[0];
  if (!anchor) return null;
  const headerLine = page.cells
    .filter((c) => c.text.trim() && c.y > prose.y + 3 && c.y < anchor.y - 8 && anchor.y - c.y < 55)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  // Keep only one visual header line (closest to the data row).
  const headerY = Math.min(...headerLine.map((c) => c.y));
  const line = headerLine.filter((c) => Math.abs(c.y - headerY) <= 5).sort((a, b) => a.x - b.x);
  if (line.length < 6) return null;

  // Group glyphs into columns: consecutive items with x gap <=7 belong together.
  const cols: (typeof page.cells)[] = [];
  for (const c of line) {
    const last = cols[cols.length - 1];
    if (last && c.x - last[last.length - 1].x <= 7) last.push(c);
    else cols.push([c]);
  }
  if (cols.length !== colCount) return null;
  // Split columns into sub-tables where the x gap between adjacent columns >30.
  const subTables: (typeof cols)[] = [[]];
  for (let i = 0; i < cols.length; i++) {
    if (i > 0 && cols[i][0].x - cols[i - 1][cols[i - 1].length - 1].x > 30) subTables.push([]);
    subTables[subTables.length - 1].push(cols[i]);
  }
  if (subTables.length < 2) return null;
  const sizes = subTables.map((s) => s.length);
  if (!sizes.every((s) => s === sizes[0])) return null;

  return subTables.map((sub, gi) => {
    const headersRich = sub.map((glyphs) =>
      glyphs
        .sort((a, b) => a.x - b.x)
        .map((c, i) => (i > 0 && c.height < glyphs[0].height * 0.9 ? `_{${c.text}}` : c.text))
        .join('')
    );
    const subRows = rows.map((r) => r.slice(gi * sizes[0], (gi + 1) * sizes[0]));
    return {
      ...table,
      id: `${table.id}_s${gi + 1}`,
      columnCount: sizes[0],
      headers: headersRich.map(toPlainText),
      headersRich,
      headerRows: [headersRich.map(toPlainText)],
      headerRowsRich: [headersRich],
      rows: subRows.map((r) => r.map(toPlainText)),
      rowsRich: subRows,
      rowCount: subRows.length,
      warnings: [...table.warnings, 'Side-by-side table split from PDF coordinates'],
    };
  });
}

/**
 * Restore full-width group-title rows (e.g. "UMAP + XGBoost") that separate
 * blocks of data. LLMs often drop them or mislabel the first data column. Such
 * a title is a single centred text item on its own visual line between data
 * rows, which is unambiguous in the coordinates.
 */
function restoreGroupTitleRows(
  page: PageData,
  rows: string[][],
  colCount: number
): string[][] | null {
  if (rows.length < 4 || colCount < 3) return null;
  // Locate the first data row y via a numeric cell from early rows.
  const numeric = rows.slice(0, 3).flat().map((v) => v?.trim() ?? '')
    .find((v) => /^[\d.,%+\-–]+$/.test(v));
  if (!numeric) return null;
  const anchor = page.cells.find((c) => c.text.trim() === numeric);
  if (!anchor) return null;

  const sorted = [...page.cells].filter((c) => c.text.trim()).sort((a, b) => a.y - b.y);
  const visualRows: (typeof page.cells)[] = [];
  for (const c of sorted) {
    const r = visualRows.find((row) => Math.abs(row[0].y - c.y) <= 4);
    if (r) r.push(c); else visualRows.push([c]);
  }
  const firstDataIdx = visualRows.findIndex((r) => r.some((c) => c === anchor || Math.abs(c.y - anchor.y) <= 4));
  if (firstDataIdx < 0) return null;

  // Single-cell lines between data rows whose text does not appear as any
  // data cell are group titles.
  const allDataText = new Set(rows.flat().map((v) => v?.trim()).filter(Boolean));
  const titles: { text: string; y: number }[] = [];
  for (let i = firstDataIdx; i < visualRows.length; i++) {
    const vr = visualRows[i];
    if (vr.length !== 1) continue;
    const text = vr[0].text.trim();
    if (!text || allDataText.has(text)) continue;
    if (!/[+()]|no |Reduction/i.test(text)) continue;
    titles.push({ text, y: vr[0].y });
  }
  if (titles.length === 0) return null;

  // Map each title to the data-row index it precedes, then insert it.
  const dataYs: number[] = [];
  for (let i = firstDataIdx; i < visualRows.length && dataYs.length < rows.length; i++) {
    const y = visualRows[i][0].y;
    if (visualRows[i].length < 3) continue; // skip title rows
    if (!dataYs.some((d) => Math.abs(d - y) <= 4)) dataYs.push(y);
  }
  // First column label from the PDF (x closest to the leftmost data column).
  const firstColX = page.cells
    .filter((c) => rows.some((r) => r[0]?.trim() === c.text.trim()))
    .map((c) => c.x);
  const labelX = firstColX.length ? Math.min(...firstColX) : 0;
  const fixFirstCol = (row: string[], y: number): string[] => {
    const copy = [...row];
    const hit = page.cells
      .filter((c) => Math.abs(c.y - y) <= 4 && c.text.trim() && Math.abs(c.x - labelX) <= 30)
      .sort((a, b) => a.x - b.x)[0];
    if (hit && hit.text.trim() && hit.text.trim() !== copy[0]) copy[0] = hit.text.trim();
    return copy;
  };

  const result: string[][] = [];
  let di = 0;
  for (const title of titles) {
    while (di < rows.length && dataYs[di] !== undefined && dataYs[di] < title.y) {
      result.push(fixFirstCol(rows[di++], dataYs[di]));
    }
    const line = Array.from({ length: colCount }, () => '');
    line[0] = title.text;
    result.push(line);
  }
  while (di < rows.length) {
    result.push(fixFirstCol(rows[di], dataYs[di] ?? 0));
    di++;
  }
  return result;
}

/**
 * Rebuild rich (sub/superscript) markup for data rows from PDF coordinates.
 * The LLM emits plain text and drops math formatting; the text items retain
 * smaller-offset glyphs that reconstructRichText can turn into _{}/^{}.
 */
function rebuildRichDataRows(
  page: PageData,
  rows: string[][],
  colCount: number
): string[][] | null {
  if (rows.length === 0 || colCount < 2) return null;
  const sorted = [...page.cells].filter((c) => c.text.trim()).sort((a, b) => a.y - b.y);
  const richRows: string[][] = [];
  const isNumeric = (s: string) => /[\d]/.test(s);
  for (const row of rows) {
    // Locate y via a numeric-looking cell, not the first text: a vertically
    // merged label (e.g. "Swin-S") sits at the group's centre, not this row's
    // y, and would pull fragments from neighbouring rows into the band.
    const text = [...row].sort((a, b) => Number(isNumeric(b ?? '')) - Number(isNumeric(a ?? '')))
      .find((v) => v?.trim())?.trim() ?? '';
    const hits = page.cells.filter((c) => c.text.trim() === text).sort((a, b) => b.y - a.y);
    const y = hits[0]?.y;
    if (y === undefined) { richRows.push([...row]); continue; }
    // Sort by x before grouping: subscripts sit a point or two lower in y, so
    // a y-ordered band can place a subscript at the end and its negative x gap
    // would wrongly append it to the last (rightmost) column group.
    let band = sorted
      .filter((c) => c.y >= y - 5 && c.y <= y + 4 && c.text.trim())
      .sort((a, b) => a.x - b.x);
    // A prose line from a neighbouring column can share the same y band and
    // add a spurious leftmost group, making groups.length != colCount. Keep
    // only cells near the x-span of the texts the LLM actually extracted.
    const rowTexts = row.map((v) => v?.trim() ?? '').filter(Boolean);
    const anchorXs = band.filter((c) => rowTexts.includes(c.text.trim())).map((c) => c.x);
    if (anchorXs.length) {
      const minX = Math.min(...anchorXs) - 120;
      const maxX = Math.max(...anchorXs) + 120;
      band = band.filter((c) => c.x >= minX && c.x <= maxX);
    }
    const groups: (typeof page.cells)[] = [];
    for (const c of band) {
      const last = groups[groups.length - 1];
      if (last && c.x - last[last.length - 1].x <= 15) last.push(c);
      else groups.push([c]);
    }
    if (groups.length !== colCount) { richRows.push([...row]); continue; }
    const rich = groups.map((g) =>
      reconstructRichText(g)
        .map((c) => c.richText.replace(/†/g, '+').replace(/\^\{o\}/g, '^{∘}'))
        .join('')
    );
    // Guard: if the rebuilt text diverges too much from the LLM's plain text
    // (e.g. fragments from an adjacent row), keep the original instead.
    const plain = (s: string) => s.replace(/[_{}^\\]/g, '').replace(/†/g, '+').trim();
    const compatible = rich.every((v, c) => {
      const a = plain(v);
      const b = plain(row[c] ?? '');
      if (!a || !b) return true;
      return a === b || a.includes(b) || b.includes(a);
    });
    richRows.push(compatible ? rich : [...row]);
  }
  if (!richRows.some((r, i) => r.some((v, c) => v !== rows[i]?.[c]))) return null;
  return richRows;
}

/**
 * Restore a leading data column that the LLM dropped entirely. Some PDFs have
 * a leftmost multirow label column (e.g. H¹₀ / H²₀ spanning three rows each)
 * whose text is vertically centred and split into super/subscript glyphs. The
 * LLM often omits the whole column. Detect labels sitting to the LEFT of the
 * LLM's first data column and insert them as a new column, repeating each label
 * across its row group so the renderer's rowSpan merges it.
 */
function restoreMissingLeadingColumn(
  page: PageData,
  rows: string[][],
  colCount: number
): { rows: string[][]; columnCount: number } | null {
  if (rows.length < 3 || colCount < 2) return null;

  // Only apply when the LLM's first data column is numeric (e.g. β values
  // 3/4/5) and a multirow label column (H¹₀/H²₀) is missing to its left. The
  // numeric column may start a few rows down if the LLM folded header text
  // into the first data rows, so scan the first three rows.
  const isNumeric = (s: string) => /^[\d.,%+\-]+$/.test(s.trim());
  const dataStart = rows.findIndex((r, i) => {
    if (i >= 3 || r.slice(1).filter((v) => isNumeric(v ?? '')).length < 2) return false;
    const first = r[0]?.trim() ?? '';
    // Numeric sub-column (β values), or a repeated text label that the LLM
    // collapsed from distinct multirow labels (e.g. "H0" for both H¹₀/H²₀).
    return isNumeric(first) || (!!first && rows.filter((x) => x[0]?.trim() === first).length >= 2);
  });
  if (dataStart < 0) return null;
  const llmText = new Set(rows.flat().map((v) => v?.trim() ?? '').filter(Boolean));

  // Locate the first column via its numeric cell. Pick the value that appears
  // fewest times on the page and take its topmost occurrence.
  // Anchor on a numeric data cell and derive the first data column's x from
  // the leftmost numeric value in the anchor row (β column), regardless of
  // whether the LLM put a collapsed text label in front of it.
  const distinctive = rows.slice(dataStart, dataStart + 2)
    .flatMap((r) => r.map((v) => v?.trim() ?? ''))
    .filter((v) => isNumeric(v))
    .map((text) => ({ text, cells: page.cells.filter((c) => c.text.trim() === text) }))
    .filter((m) => m.cells.length > 0)
    .sort((a, b) => a.cells.length - b.cells.length);
  if (!distinctive.length) return null;
  const anchor = distinctive[0].cells.reduce((a, b) => (a.y < b.y ? a : b));
  const dataY = anchor.y;
  const anchorRow = rows[dataStart];
  const numericCells = anchorRow
    .map((v, ci) => ({ ci, text: v?.trim() ?? '' }))
    .filter((x) => isNumeric(x.text))
    .map((x) => ({ ...x, cell: page.cells.find((c) => c.text.trim() === x.text) }))
    .filter((x): x is typeof x & { cell: (typeof page.cells)[number] } => !!x.cell);
  if (!numericCells.length) return null;
  const firstColX = Math.min(...numericCells.map((x) => x.cell.x));

  // Candidate label glyphs: non-numeric text strictly left of the first column,
  // within a tight vertical band around the table's data rows.
  const sorted = [...page.cells].filter((c) => c.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const candidates = sorted.filter(
    (c) => c.x + c.width < firstColX - 10 && c.y >= dataY - 8 && c.y <= dataY + rows.length * 22
  );
  if (candidates.length < 2) return null;
  // Several text columns may sit left of the numeric data (e.g. a method-name
  // column plus a missing ILP/IM/HM group column). Cluster by x and pick the
  // rightmost cluster whose labels are mostly absent from the LLM output —
  // that is the dropped column, while the method names are already present.
  const xClusters: (typeof candidates)[] = [];
  for (const c of [...candidates].sort((a, b) => a.x - b.x)) {
    const cl = xClusters[xClusters.length - 1];
    if (cl && c.x - cl[cl.length - 1].x <= 15) cl.push(c);
    else xClusters.push([c]);
  }
  const usable = [...xClusters].reverse().find((cl) =>
    cl.filter((c) => {
      const t = c.text.trim();
      return t && t.length <= 20 && !isNumeric(t) && !llmText.has(t);
    }).length >= 1
  );
  if (!usable || usable.length > 20) return null;
  const leftGlyphs = usable;

  // Group glyphs into visual rows first (a multirow label's H, super- and
  // subscript sit at slightly different y), then merge each row's fragments.
  const groups: (typeof leftGlyphs)[] = [];
  for (const c of [...leftGlyphs].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const g = groups.find((row) => Math.abs(row[0].y - c.y) <= 10);
    if (g) g.push(c); else groups.push([c]);
  }
  const richRaw = groups.flatMap((g) => reconstructRichText(g)).filter((c) => c.richText.trim());
  // reconstructRichText can leave a subscript digit separate after a superscript
  // was absorbed (its width check then rejects the digit). Fuse such an orphan
  // digit back into the preceding label, e.g. "H^{1}" + "0" -> "H^{1}_{0}".
  const rich: typeof richRaw = [];
  for (const cell of richRaw) {
    const prev = rich[rich.length - 1];
    if (prev && /\^\{\d+\}$/.test(prev.richText) && /^\d$/.test(cell.richText) && Math.abs(cell.y - prev.y) < 10) {
      prev.richText += `_{${cell.richText}}`;
    } else {
      rich.push({ ...cell });
    }
  }
  // The chosen x-cluster is already the leftmost label column; keep all its
  // short non-numeric labels even if the LLM echoed some of them (e.g. IM) in
  // misplaced data rows.
  const labels = rich.filter((c) => {
    const t = normalizeMarkup(c.richText.trim());
    return t && t.length <= 20 && !isNumeric(t);
  });
  // A nearby table lower on the page can fall inside the y band; keep only
  // the labels belonging to this table (the topmost contiguous group).
  labels.sort((a, b) => a.y - b.y);
  if (labels.length > 6) labels.length = 6;
  if (labels.length < 2) return null;

  // Determine data row y positions: consecutive visual rows starting at dataY.
  const dataRowYs: number[] = [];
  for (const c of sorted) {
    if (c.y < dataY - 4 || c.y > dataY + rows.length * 30) continue;
    if (c.x < firstColX - 12) continue; // ignore the label column itself
    if (dataRowYs.length === 0 || c.y - dataRowYs[dataRowYs.length - 1] > 8) dataRowYs.push(c.y);
  }
  if (dataRowYs.length < rows.length - 1) return null;

  // Snap each label to its nearest data row (its y is the group's centre).
  const marks = labels.map((c) => {
    const cy = c.y + c.height / 2;
    let idx = 0, best = Infinity;
    for (let i = 0; i < Math.min(dataRowYs.length, rows.length); i++) {
      const d = Math.abs(dataRowYs[i] - cy);
      if (d < best) { best = d; idx = i; }
    }
    return { text: normalizeMarkup(c.richText.trim()), idx };
  }).sort((a, b) => a.idx - b.idx);
  if (marks.length < 2 || marks[0].idx === marks[marks.length - 1].idx) return null;

  // Assign each data row to the nearest label group (split at midpoints).
  const boundaries = marks.slice(1).map((m, i) => (marks[i].idx + m.idx) / 2);
  // Replace only when the LLM's first column is physically aligned with the
  // dropped label column (e.g. collapsed "H0" at the H¹₀ x position). If its
  // text sits in a different column (method names shifted left), insert a new
  // leading column instead so no existing data is lost.
  const labelX = usable.reduce((sum, c) => sum + c.x, 0) / usable.length;
  const firstCell = page.cells.find((c) => c.text.trim() === (rows[dataStart][0] ?? '').trim());
  const replaces = !isNumeric(rows[dataStart][0] ?? '') &&
    (!firstCell || Math.abs(firstCell.x - labelX) <= 15);
  const finalRows = rows.map((row, ri) => {
    let label = '';
    if (ri >= dataStart) {
      const dr = ri - dataStart;
      let gi = 0;
      while (gi < boundaries.length && dr >= boundaries[gi]) gi++;
      label = marks[gi].text;
    } else if (row.some((v) => isNumeric(v ?? ''))) {
      // Header text folded into an early data row: it belongs to group 0.
      label = marks[0].text;
    }
    return replaces ? [label, ...row.slice(1)] : [label, ...row];
  });
  return { rows: finalRows, columnCount: replaces ? colCount : colCount + 1 };
}

/**
 * Restore vertically-merged data cells (multirow). In PDFs the label of a
 * multirow cell is vertically centred, so the LLM leaves some column-0 cells
 * empty and puts the label on the group's middle row. We use the PDF text
 * coordinates to find the true row index of each label (its y snapped to the
 * nearest data row), split rows at the midpoints between consecutive labels,
 * and repeat each label across its group so rowSpan can merge it.
 */
function restoreMergedDataCells(
  page: PageData,
  rows: string[][],
  colCount: number
): string[][] | null {
  if (rows.length < 3 || colCount < 2) return null;

  // Distinct labels seen in column 0 of the LLM output.
  const labels: string[] = [];
  for (const row of rows) {
    const text = row[0]?.trim() ?? '';
    if (text && !labels.includes(text)) labels.push(text);
  }
  if (labels.length < 2) return null;
  // Trigger when there are empty cells to fill OR the first column has an
  // adjacent duplicate immediately followed by a distinct label (a sign the
  // LLM misplaced a vertically-merged label).
  const emptyCount = rows.filter((r) => !r[0]?.trim()).length;
  const suspiciousDuplicate = rows.some(
    (r, i) => i > 0 && i < rows.length - 1 && r[0]?.trim() && r[0].trim() === rows[i - 1][0]?.trim() && rows[i + 1][0]?.trim() && rows[i + 1][0].trim() !== r[0].trim()
  );
  if (emptyCount < labels.length - 1 && !suspiciousDuplicate) return null;

  // Data-row y positions: anchor on a distinctive numeric value (appearing
  // once on the page), then collect consecutive visual rows below it.
  const distinctive = rows
    .flatMap((r) => [r[1], r[2]])
    .map((v) => v?.trim() ?? '')
    .filter(Boolean)
    .map((text) => ({ text, count: page.cells.filter((c) => c.text.trim() === text).length }))
    .filter((m) => m.count === 1);
  let dataRowYs: number[] = [];
  const sortedCells = [...page.cells].filter((c) => c.text.trim()).sort((a, b) => a.y - b.y);
  for (const m of distinctive) {
    const hit = page.cells.find((c) => c.text.trim() === m.text);
    if (!hit) continue;
    const start = sortedCells.findIndex((c) => c === hit);
    const ys: number[] = [];
    for (let i = start; i < sortedCells.length && ys.length < rows.length; i++) {
      const y = sortedCells[i].y;
      if (ys.length === 0 || y - ys[ys.length - 1] > 8) ys.push(y);
    }
    if (ys.length === rows.length) { dataRowYs = ys; break; }
  }
  if (dataRowYs.length < 2) return null;

  // For each label, find its y on the page and snap to the nearest data row.
  const marks: { text: string; idx: number }[] = [];
  for (const text of labels) {
    const hit = page.cells.find((c) => c.text.trim() === text);
    if (!hit) continue;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < dataRowYs.length; i++) {
      const d = Math.abs(dataRowYs[i] - hit.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    marks.push({ text, idx: bestIdx });
  }
  if (marks.length < 2) return null;
  marks.sort((a, b) => a.idx - b.idx);

  const boundaries = marks.slice(1).map((m, i) => (marks[i].idx + m.idx) / 2);
  const restored = rows.map((row) => [...row]);
  for (let ri = 0; ri < rows.length; ri++) {
    let gi = 0;
    while (gi < boundaries.length && ri >= boundaries[gi]) gi++;
    restored[ri][0] = marks[gi].text;
  }
  return restored;
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
      const raw = parseLlmJson(content);
      parsed = LLM_RESPONSE.parse(raw);
    } catch (e) {
      // One malformed table must not discard the whole page: parse the JSON
      // loosely and keep every table that passes per-table validation.
      try {
        const raw = parseLlmJson(content);
        const rawTables = Array.isArray((raw as { tables?: unknown[] })?.tables)
          ? (raw as { tables: unknown[] }).tables : [];
        const valid = rawTables
          .map((t: unknown) => LLM_TABLE.safeParse(t))
          .filter((r: z.SafeParseReturnType<unknown, z.infer<typeof LLM_TABLE>>) => r.success)
          .map((r: z.SafeParseSuccess<z.infer<typeof LLM_TABLE>>) => r.data);
        if (valid.length > 0) {
          parsed = { tables: valid };
        } else {
          const reason = e instanceof Error ? e.message.slice(0, 200) : 'unknown';
          return {
            tables: ruleTables,
            usage,
            latencyMs: Date.now() - started,
            error: `LLM output failed validation (${reason}); kept rule-based result. Raw: ${content.slice(0, 300)}`,
          };
        }
      } catch {
        const reason = e instanceof Error ? e.message.slice(0, 200) : 'unknown';
        return {
          tables: ruleTables,
          usage,
          latencyMs: Date.now() - started,
          error: `LLM output failed validation (${reason}); kept rule-based result. Raw: ${content.slice(0, 300)}`,
        };
      }
    }

    // Dense pages can cause the LLM to drop tables near the bottom. For such
    // pages, run two additional passes on the top and bottom halves and merge
    // any tables not already found. This trades extra tokens for recall.
    if (page.cells.length > 100) {
      const ys = page.cells.map((c) => c.y).sort((a, b) => a - b);
      const midY = ys[Math.floor(ys.length / 2)];
      const halves: PageData[] = [
        { ...page, cells: page.cells.filter((c) => c.y <= midY) },
        { ...page, cells: page.cells.filter((c) => c.y > midY) },
      ];
      const cellSet = (t: z.infer<typeof LLM_TABLE>) =>
        new Set(t.rows.flat().map((v) => v.trim()).filter(Boolean));
      const kept: z.infer<typeof LLM_TABLE>[] = parsed.tables;
      const isDuplicate = (candidate: z.infer<typeof LLM_TABLE>) => {
        const cs = cellSet(candidate);
        if (cs.size === 0) return true;
        return kept.some((existing) => {
          const es = cellSet(existing);
          let overlap = 0;
          for (const v of cs) if (es.has(v)) overlap++;
          // Skip tiny/degenerate candidate tables.
          return cs.size < 3 || overlap / Math.max(1, Math.min(cs.size, es.size)) >= 0.6;
        });
      };
      for (const half of halves) {
        if (half.cells.length < 5) continue;
        try {
          const sliced = await callLlm(buildPagePrompt(half, []), config);
          const part = LLM_RESPONSE.parse(JSON.parse(sliced.content));
          for (const t of part.tables) {
            if (!isDuplicate(t)) kept.push(t);
          }
          if (sliced.usage && usage) {
            usage.promptTokens += sliced.usage.promptTokens;
            usage.completionTokens += sliced.usage.completionTokens;
            usage.totalTokens += sliced.usage.totalTokens;
          }
        } catch { /* keep whole-page result on slice failure */ }
      }
    }
    const pageTables: TableData[] = parsed.tables.filter((t) => !isLikelyProse(t)).map((t, i) => {
      const { table: n, columnCount: normalizedColCount, mergedColumns } = normalizeTable(t);
      let columnCount = normalizedColCount;
      const warnings = ['AI assisted extraction; please review'];
      if (mergedColumns.length) {
        warnings.push(
          `Merged cells filled down in column ${mergedColumns.map((c) => c + 1).join(', ')}; please verify`
        );
      }

      let rows = n.rows;
      // Remove a group title that the LLM folded into the header line — it
      // belongs with the data rows as a full-width separator.
      let headerRows = n.headerRows ?? [];
      headerRows = headerRows.map((hr) => hr.map((v) =>
        /^(UMAP|XGBoost|Random Forest)\b.*(?:\+|no Dim)/i.test(v?.trim() ?? '') ? '' : v
      ));
      const leading = restoreMissingLeadingColumn(page, rows, columnCount);
      if (leading) {
        rows = leading.rows;
        columnCount = leading.columnCount;
        warnings.push('Leading multirow label column restored from PDF text coordinates; please verify');
      }
      const restoredRows = restoreMergedDataCells(page, rows, columnCount);
      if (restoredRows) {
        rows = restoredRows;
        warnings.push('Merged data cells restored from PDF text coordinates; please verify');
      }
      const groupedRows = restoreGroupTitleRows(page, rows, columnCount);
      if (groupedRows) {
        rows = groupedRows;
        warnings.push('Group title rows restored from PDF text coordinates; please verify');
      }

      let headers = n.headers;
      const rebuilt = rebuildHeaderRowsFromCoords(page, rows, columnCount, n.headerRows ?? []);
      if (rebuilt && rebuilt.some((hr) => hr.some((v) => v.trim()))) {
        headerRows = rebuilt;
        headers = Array.from({ length: columnCount }, (_, c) => {
          const parts = headerRows.map((hr) => hr[c]?.trim() ?? '').filter(Boolean);
          const dedup = parts.filter((p, idx) => idx === 0 || p !== parts[idx - 1]);
          return dedup.join('/');
        });
        warnings.push('Group headers rebuilt from PDF text coordinates; please verify');
      }

      // An LLM may misplace a row-spanning row-label (e.g. "ResNet-18") into
      // the first data row with all other cells empty. It is really the header
      // label for column 0 — move it there and drop the phantom data row.
      if (
        rows.length > 1 &&
        rows[0][0]?.trim() &&
        !/^[\d.,%+\-]+$/.test(rows[0][0].trim()) &&
        rows[0].slice(1).every((v) => !v?.trim()) &&
        headerRows.length > 0
      ) {
        const label = rows[0][0].trim();
        for (const hr of headerRows) if (!hr[0]?.trim()) hr[0] = label;
        if (headers[0] && !headers[0].includes(label)) headers[0] = label;
        rows = rows.slice(1);
        warnings.push('Row label moved from data to header; please verify');
      }

      const richRows = (rebuildRichDataRows(page, rows, columnCount) ?? rows).map((r) =>
        r.map((v) => {
          let out = v.replace(/†/g, '+');
          for (const [pua, unicode] of Object.entries(PUA_SYMBOL_MAP)) out = out.split(pua).join(unicode);
          return out;
        })
      );
      if (richRows !== rows) warnings.push('Sub/superscript formatting rebuilt from PDF coordinates');

      return {
        id: `table_llm_${page.pageNumber}_${i + 1}`,
        page: page.pageNumber,
        rowCount: rows.length,
        columnCount,
        headers: headers.map(toPlainText),
        rows: rows.map((row) => row.map(toPlainText)),
        headersRich: headers,
        rowsRich: richRows,
        headerRows: headerRows.map((hr) => hr.map(toPlainText)),
        headerRowsRich: headerRows,
        confidence: n.confidence,
        source: 'llm' as const,
        warnings,
      };
    });
    const finalTables = pageTables.flatMap((t) => splitSideBySideTables(page, t) ?? [t]);
    return { tables: finalTables, usage, latencyMs: Date.now() - started };
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
      parsed = LLM_RESPONSE.parse(parseLlmJson(content));
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
