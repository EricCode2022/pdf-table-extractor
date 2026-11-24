import { z } from 'zod';
import type { TableData } from '@/types/table';
import type { PageData } from '@/lib/pdf/parser';
import { reconstructRichText } from '@/lib/pdf/richtext';

const LLM_TABLE = z.object({
  headers: z.array(z.string()),
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
    'Return ONLY JSON: {"tables":[{"headers":["..."],"rows":[["..."]],"confidence":0.0}]}',
    'Rules: do not invent data; preserve numbers exactly; preserve words exactly including first letters (e.g. CLOAK, not LOAK); if a table has no header, return headers: []; include every table you can find.',
    'IMPORTANT: In "Rebuilt text", each element with the same y is ONE cell/column. Do not merge two different elements into one cell, even if they look related. Rebuilt text already merges sub/superscripts (a_{b}, a^{b}), split math symbols (ETT), and multiplied expressions (N_{x}×N_{y}×N_{z}) into single elements — keep them as ONE header, never split them. Map each element to exactly one column by its x position.',
    'CRITICAL: The number of columns is determined by the DATA ROWS (look at how many distinct x positions appear in data rows like numbers), NOT by the header rows. Multi-level headers often span multiple columns and may have FEWER text items than data columns — never shrink the table to match the header. If a header has fewer cells than data rows, pad headers with "" so every row has the SAME column count. NEVER drop a data value (e.g. a rightmost repeated number) just because no header sits above it.',
    'Example: 9 data columns "10|0.53|45|3.8|10000|0.63|120|4.8|63096" with grouped header "k=2" over first 4 columns and "k=3" over last 4. Output headers must have EXACTLY 9 cells, one per data column — e.g. ["d","beta","d/2","log","eps","beta","d/3","log","eps"]. Never merge math into fewer header cells, never add extra header cells beyond the data column count.',
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
  // Fold chained superscripts: 98.87^{±}^{0.00} -> 98.87^{±0.00}
  let out = text.replace(/\^\{([^{}]*)\}\^\{([^{}]*)\}/g, '^{$1$2}');
  return out;
}

// Convert markup to plain text for export/copy (preserves readability).
function toPlainText(text: string): string {
  let out = normalizeMarkup(text);
  out = out.replace(/_\{([^{}]{1,12})\}/g, '$1');
  out = out.replace(/\^\{([^{}]{1,12})\}/g, (_, s: string) => toSuperscript(s));
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
  let headers = t.headers.map(normalizeMarkup).map((h) => (/^column\s+\d+$/i.test(h.trim()) ? '' : h));
  let rows = t.rows.map((row) => row.map(normalizeMarkup));

  rows = rows.map(trimTrailingEmpty);
  headers = trimTrailingEmpty(headers);

  const dataCols = Math.max(0, ...rows.map((r) => r.length));
  const colCount = dataCols > 0 ? dataCols : headers.length;

  const normalizedHeaders = headers.slice(0, colCount);
  while (normalizedHeaders.length < colCount) normalizedHeaders.push('');
  const normalizedRows = rows.map((row) => {
    const r = row.slice(0, colCount);
    while (r.length < colCount) r.push('');
    return r;
  });

  // Remove columns that are empty in the header AND every data row (multi-level
  // header placeholders). Keep at least one column.
  const keepCols: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const headerEmpty = !normalizedHeaders[c]?.trim();
    const allRowsEmpty = normalizedRows.every((r) => !r[c]?.trim());
    if (!(headerEmpty && allRowsEmpty)) keepCols.push(c);
  }
  if (keepCols.length > 0 && keepCols.length < colCount) {
    const filteredHeaders = keepCols.map((c) => normalizedHeaders[c]);
    const filteredRows = normalizedRows.map((row) => keepCols.map((c) => row[c]));
    normalizedHeaders.length = 0;
    normalizedHeaders.push(...filteredHeaders);
    normalizedRows.length = 0;
    normalizedRows.push(...filteredRows);
  }

  const finalColCount = normalizedHeaders.length;

  // Detect vertically merged cells: first row has a value, all following rows empty in same column.
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
    table: { headers: normalizedHeaders, rows: normalizedRows, confidence: t.confidence },
    columnCount: finalColCount,
    mergedColumns,
  };
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
    } catch {
      return {
        tables: ruleTables,
        usage,
        latencyMs: Date.now() - started,
        error: 'LLM output failed validation; kept rule-based result',
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
      return {
        id: `table_llm_${page.pageNumber}_${i + 1}`,
        page: page.pageNumber,
        rowCount: n.rows.length,
        columnCount,
        headers: n.headers.map(toPlainText),
        rows: n.rows.map((row) => row.map(toPlainText)),
        headersRich: n.headers,
        rowsRich: n.rows,
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
