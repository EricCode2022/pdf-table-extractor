import { NextResponse } from 'next/server';
import { putFile } from '@/lib/storage';
import { buildExcel } from '@/lib/export/excel';
import { buildCsv } from '@/lib/export/csv';
import { TableSchema } from '@/types/table';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BodySchema = z.object({
  format: z.enum(['xlsx', 'csv']),
  tables: z.array(TableSchema).min(1),
  fileName: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const baseName = (body.fileName ?? 'tables').replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
    let buffer: Buffer;
    let contentType: string;
    let ext: string;

    if (body.format === 'xlsx') {
      buffer = await buildExcel(body.tables);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      ext = 'xlsx';
    } else {
      buffer = Buffer.from(buildCsv(body.tables), 'utf8');
      contentType = 'text/csv; charset=utf-8';
      ext = 'csv';
    }

    const fileName = `${baseName}.${ext}`;
    const { url } = await putFile(buffer, fileName);
    return NextResponse.json({ url, fileName, size: buffer.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    const status = err instanceof z.ZodError ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
