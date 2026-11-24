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
    'Rules: do not invent data; preserve numbers exactly; if a table has no header, return headers: []; include every table you can find.',
    'IMPORTANT: In "Rebuilt text", each element with the same y is ONE cell/column. Do not merge two different elements into one cell, even if they look related. Rebuilt text already merges sub/superscripts (a_{b}, a^{b}), split math symbols (ETT), and multiplied expressions (N_{x}×N_{y}×N_{z}) into single elements — keep them as ONE header, never split them. Map each element to exactly one column by its x position.',
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
    const pageTables: TableData[] = parsed.tables.map((t, i) => ({
      id: `table_llm_${page.pageNumber}_${i + 1}`,
      page: page.pageNumber,
      rowCount: t.rows.length,
      columnCount: t.headers.length || (t.rows[0]?.length ?? 0),
      headers: t.headers,
      rows: t.rows,
      confidence: t.confidence,
      source: 'llm',
      warnings: ['AI assisted extraction; please review'],
    }));
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
