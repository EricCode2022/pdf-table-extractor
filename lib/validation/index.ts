import { z } from 'zod';
import path from 'path';

export const MAX_FILE_SIZE_MB = 20;
export const MAX_PDF_PAGES = 50;

export const UploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_FILE_SIZE_MB * 1024 * 1024),
  pages: z.number().int().positive().max(MAX_PDF_PAGES).optional(),
  token: z.string().optional(),
});

export function validatePdfFile(file: { name: string; size: number }): void {
  const ext = path.extname(file.name).toLowerCase();
  if (ext !== '.pdf') throw new Error('Only PDF files are allowed');
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`File exceeds ${MAX_FILE_SIZE_MB} MB limit`);
  }
  if (file.size === 0) throw new Error('File is empty');
}
