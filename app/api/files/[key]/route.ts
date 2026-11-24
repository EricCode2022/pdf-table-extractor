import { NextResponse } from 'next/server';
import path from 'path';
import { storage } from '@/lib/storage/local';

export const runtime = 'nodejs';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
};

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  try {
    const buffer = await storage.get(key);
    const ext = path.extname(key).toLowerCase();
    const contentType = MIME[ext] ?? 'application/octet-stream';
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': ext === '.pdf' ? 'inline' : `attachment; filename="${path.basename(key).replace(/^[0-9a-f-]+-/i, '')}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
