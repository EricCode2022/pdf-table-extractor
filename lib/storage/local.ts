import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { StorageAdapter } from '@/types/table';

const UPLOAD_DIR = path.join(process.cwd(), '.tmp', 'uploads');

export class LocalStorageAdapter implements StorageAdapter {
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    void fs.mkdir(UPLOAD_DIR, { recursive: true });
  }

  async put(buffer: Buffer, fileName: string): Promise<{ key: string; url: string }> {
    const key = `${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(UPLOAD_DIR, key);
    await fs.writeFile(filePath, buffer);
    return { key, url: `/api/files/${key}` };
  }

  async get(key: string): Promise<Buffer> {
    const safeKey = path.basename(key);
    return fs.readFile(path.join(UPLOAD_DIR, safeKey));
  }

  async delete(key: string): Promise<void> {
    const safeKey = path.basename(key);
    await fs.unlink(path.join(UPLOAD_DIR, safeKey)).catch(() => {});
  }

  scheduleCleanup(maxAgeMs: number): void {
    if (this.timer) clearInterval(this.timer);
    const clean = async () => {
      const now = Date.now();
      const files = await fs.readdir(UPLOAD_DIR).catch(() => []);
      for (const file of files) {
        const stat = await fs.stat(path.join(UPLOAD_DIR, file)).catch(() => null);
        if (stat && now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(path.join(UPLOAD_DIR, file)).catch(() => {});
        }
      }
    };
    void clean();
    this.timer = setInterval(clean, Math.min(maxAgeMs, 60 * 60 * 1000));
    this.timer.unref?.();
  }
}

export const storage = new LocalStorageAdapter();

// Only start the cleanup timer in a long-running local process. On Vercel, module
// imports happen per-invocation and a dangling interval prevents the function from settling.
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  storage.scheduleCleanup(24 * 60 * 60 * 1000);
}
