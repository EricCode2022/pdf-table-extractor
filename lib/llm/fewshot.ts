import fs from 'fs';
import path from 'path';

export interface FewShotExample {
  columns: number;
  headerRows: string[][];
  rows: string[][];
}

interface FewShotFile {
  version: number;
  generatedAt: string;
  examples: FewShotExample[];
}

let cached: { mtimeMs: number; examples: FewShotExample[] } | null = null;

const FILE = path.join(process.cwd(), 'data', 'fewshot-examples.json');

/**
 * Load human-reviewed few-shot exemplars. Returns [] when the file is absent
 * or FEWSHOT_ENABLED=0, so the default behaviour is unchanged until a review
 * set has been built. Cached by mtime; safe to regenerate the file at runtime.
 */
export function getFewShotExamples(): FewShotExample[] {
  if (process.env.FEWSHOT_ENABLED === '0') return [];
  try {
    const stat = fs.statSync(FILE);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.examples;
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as FewShotFile;
    const examples = Array.isArray(parsed.examples) ? parsed.examples.slice(0, 12) : [];
    cached = { mtimeMs: stat.mtimeMs, examples };
    return examples;
  } catch {
    return [];
  }
}

/** Render exemplars as a compact prompt block. */
export function fewShotPromptBlock(): string {
  const examples = getFewShotExamples();
  if (!examples.length) return '';
  const lines = [
    '<FEWSHOT_BEGIN>',
    'The following are OUTPUT-FORMAT EXAMPLES ONLY, taken from human-reviewed tables.',
    'They are NOT part of the PDF on this page. Do NOT copy their data into your output.',
    'Only use them to learn how to lay out multi-level headerRows and flatten headers.',
  ];
  for (const ex of examples.slice(0, 6)) {
    lines.push(`EXAMPLE columns=${ex.columns}: ${JSON.stringify({ headerRows: ex.headerRows, rows: ex.rows })}`);
  }
  lines.push('<FEWSHOT_END>');
  return lines.join('\n');
}
