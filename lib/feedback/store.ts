import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FeedbackEntry, FeedbackSummary } from '@/types/feedback';

const DIR = path.join(process.cwd(), '.tmp', 'feedback');

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

function safeId(id: string): string {
  return path.basename(id).replace(/[^a-zA-Z0-9._-]/g, '');
}

export async function saveFeedback(entry: Omit<FeedbackEntry, 'id' | 'submittedAt'>): Promise<FeedbackEntry> {
  await ensureDir();
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const full: FeedbackEntry = { ...entry, id, submittedAt: new Date().toISOString() };
  await fs.writeFile(path.join(DIR, `${safeId(id)}.json`), JSON.stringify(full, null, 2));
  return full;
}

export async function listFeedback(): Promise<FeedbackSummary[]> {
  await ensureDir();
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
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${safeId(id)}.json`), 'utf8')) as FeedbackEntry;
  } catch { return null; }
}
