import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FeedbackEntry, FeedbackSummary } from '@/types/feedback';

const DIR = path.join(process.cwd(), '.tmp', 'feedback');
const BLOB_PREFIX = 'feedback/';
const isVercel = !!process.env.VERCEL || !!process.env.BLOB_READ_WRITE_TOKEN;

function safeId(id: string): string {
  return path.basename(id).replace(/[^a-zA-Z0-9._-]/g, '');
}

function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  return token;
}

async function readBlobJson(pathnameOrUrl: string): Promise<FeedbackEntry | null> {
  const { get } = await import('@vercel/blob');
  const result = await get(pathnameOrUrl, { access: 'private', token: blobToken() });
  if (!result) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as FeedbackEntry;
}

export async function saveFeedback(entry: Omit<FeedbackEntry, 'id' | 'submittedAt'>): Promise<FeedbackEntry> {
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const full: FeedbackEntry = { ...entry, id, submittedAt: new Date().toISOString() };
  const content = JSON.stringify(full, null, 2);

  if (isVercel) {
    // Store in Vercel Blob so feedback survives serverless restarts.
    const { put } = await import('@vercel/blob');
    await put(`${BLOB_PREFIX}${safeId(id)}.json`, content, {
      access: 'private',
      token: blobToken(),
      addRandomSuffix: false,
      contentType: 'application/json',
    });
    return full;
  }

  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, `${safeId(id)}.json`), content);
  return full;
}

export async function listFeedback(): Promise<FeedbackSummary[]> {
  if (isVercel) {
    const { list } = await import('@vercel/blob');
    const result = await list({ prefix: BLOB_PREFIX, token: blobToken() });
    const entries = await Promise.all(
      result.blobs.map(async (blob) => {
        try {
          const data = await readBlobJson(blob.pathname);
          if (!data) return null;
          return {
            id: data.id, submittedAt: data.submittedAt, sourceFile: data.sourceFile,
            clientId: data.clientId, tableCount: data.tableCount ?? data.tables?.length ?? 0,
          };
        } catch { return null; }
      })
    );
    const valid: FeedbackSummary[] = [];
    for (const e of entries) if (e) valid.push(e);
    return valid.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  await fs.mkdir(DIR, { recursive: true });
  const files = await fs.readdir(DIR);
  const entries = await Promise.all(
    files.filter((f) => f.endsWith('.json')).map(async (f) => {
      try {
        const data = JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8')) as FeedbackEntry;
        return {
          id: data.id, submittedAt: data.submittedAt, sourceFile: data.sourceFile,
          clientId: data.clientId, tableCount: data.tableCount ?? data.tables?.length ?? 0,
        };
      } catch { return null; }
    })
  );
  const valid: FeedbackSummary[] = [];
  for (const e of entries) if (e) valid.push(e);
  return valid.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function getFeedback(id: string): Promise<FeedbackEntry | null> {
  const safe = safeId(id);
  if (isVercel) {
    const { list } = await import('@vercel/blob');
    const result = await list({ prefix: `${BLOB_PREFIX}${safe}.json`, token: blobToken() });
    if (!result.blobs.length) return null;
    try { return await readBlobJson(result.blobs[0].pathname); }
    catch { return null; }
  }
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${safe}.json`), 'utf8')) as FeedbackEntry;
  } catch { return null; }
}
