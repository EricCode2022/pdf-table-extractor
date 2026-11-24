import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const ext = pathname.toLowerCase().split('.').pop();
        if (ext !== 'pdf') throw new Error('Only PDF files are allowed');
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 20 * 1024 * 1024,
          addRandomSuffix: true,
          ttlDays: 1,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token generation failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
