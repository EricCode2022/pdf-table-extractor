import { NextResponse } from 'next/server';
import { putFile } from '@/lib/storage';
import { validatePdfFile } from '@/lib/validation';
import { parsePdf } from '@/lib/pdf/parser';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    validatePdfFile({ name: file.name, size: file.size });
    const buffer = Buffer.from(await file.arrayBuffer());

    let totalPages = 0;
    try {
      const pages = await parsePdf(buffer, 1);
      totalPages = pages.length;
    } catch {
      // Page count is best-effort here; full parse happens in /api/extract.
    }

    const { key, url } = await putFile(buffer, file.name);
    return NextResponse.json({ key, url, fileName: file.name, size: file.size, totalPages });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
