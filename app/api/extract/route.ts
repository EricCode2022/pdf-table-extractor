import { NextResponse } from 'next/server';
import { getFileBuffer } from '@/lib/storage';
import { parsePdf } from '@/lib/pdf/parser';
import { detectTables } from '@/lib/pdf/detector';
import { getLlmConfig, extractPagesWithLlm } from '@/lib/llm/fallback';
import { ExtractResultSchema, type ExtractResult, type TableData } from '@/types/table';
import { MAX_PDF_PAGES } from '@/lib/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BodySchema = z.object({
  key: z.string().optional(),
  url: z.string().url().optional(),
  fileName: z.string().min(1),
  enableLlm: z.boolean().optional().default(true),
}).refine((b) => b.key || b.url, { message: 'key or url is required' });

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const buffer = await getFileBuffer({ key: body.key, url: body.url });
    const pages = await parsePdf(buffer, MAX_PDF_PAGES);
    const ruleTables = detectTables(pages);

    const byPage = new Map<number, TableData[]>();
    for (const table of ruleTables) {
      const list = byPage.get(table.page) ?? [];
      list.push(table);
      byPage.set(table.page, list);
    }

    const config = getLlmConfig();
    let tables: TableData[] = ruleTables;
    let llmErrors: string[] | undefined;
    let llmUsage: ExtractResult['llmUsage'];
    let llmLatencyMs: number | undefined;
    if (config) {
      const outcome = await extractPagesWithLlm(pages, byPage, config, body.enableLlm);
      tables = outcome.tables;
      llmErrors = outcome.errors.length ? outcome.errors : undefined;
      llmUsage = outcome.usage.length ? outcome.usage : undefined;
      llmLatencyMs = outcome.latencyMs;
    }

    const result: ExtractResult = {
      fileName: body.fileName,
      totalPages: pages.length,
      tables,
      llmErrors,
      llmUsage,
      llmLatencyMs,
    };
    const validated = ExtractResultSchema.parse(result);
    return NextResponse.json(validated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    const status = err instanceof z.ZodError ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
