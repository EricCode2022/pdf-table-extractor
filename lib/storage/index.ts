import { get } from '@vercel/blob';
import { storage as localStorage } from './local';

export const isVercel = !!process.env.VERCEL || !!process.env.BLOB_READ_WRITE_TOKEN;

export type FileSource = { key?: string; url?: string };

export async function putFile(
  buffer: Buffer,
  fileName: string,
  ttlDays = 1
): Promise<{ key: string; url: string }> {
  if (isVercel) {
    // Server-side put is only for small files; production uploads use client-direct upload.
    const { put } = await import('@vercel/blob');
    const blob = await put(fileName, buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
      ...(ttlDays ? { ttlDays } : {}),
    });
    return { key: blob.pathname, url: blob.url };
  }
  return localStorage.put(buffer, fileName);
}

export async function getFileBuffer(source: FileSource): Promise<Buffer> {
  if (source.url && isVercel) {
    const result = await get(source.url, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200) throw new Error('Blob not found');
    const array = await new Response(result.stream).arrayBuffer();
    return Buffer.from(array);
  }
  if (source.key) {
    return localStorage.get(source.key);
  }
  if (source.url) {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error('Failed to download file');
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('No file source provided');
}

export async function deleteFile(source: FileSource): Promise<void> {
  if (isVercel && source.url) {
    const { del } = await import('@vercel/blob');
    await del(source.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return;
  }
  if (source.key) await localStorage.delete(source.key);
}

export const storage = localStorage;
