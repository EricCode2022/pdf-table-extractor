import { z } from 'zod';

export const TableCellSchema = z.string();

export const TableSchema = z.object({
  id: z.string(),
  page: z.number().int().positive(),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  headersRich: z.array(z.string()).optional(),
  rowsRich: z.array(z.array(z.string())).optional(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['rules', 'llm', 'hybrid']),
  warnings: z.array(z.string()),
});

export const LlmUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

export const ExtractResultSchema = z.object({
  fileName: z.string(),
  totalPages: z.number().int().nonnegative(),
  tables: z.array(TableSchema),
  llmErrors: z.array(z.string()).optional(),
  llmUsage: z.array(LlmUsageSchema).optional(),
  llmLatencyMs: z.number().optional(),
});

export type TableData = z.infer<typeof TableSchema>;
export type ExtractResult = z.infer<typeof ExtractResultSchema>;

export type StorageAdapter = {
  put(buffer: Buffer, fileName: string): Promise<{ key: string; url: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  scheduleCleanup(maxAgeMs: number): void;
};
