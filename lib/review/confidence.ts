import type { TableData } from '@/types/table';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ReviewStatus {
  level: ConfidenceLevel;
  score: number;       // 0..1, for sorting
  reasons: string[];   // human-readable, shown in UI
}

/**
 * Derive a review priority from structural signals rather than the LLM's
 * self-reported confidence (which defaults to 0.8 regardless of quality).
 * A table is "low" when it has structural defects that our structural
 * evaluation has shown to correlate with wrong output.
 */
export function assessTable(table: TableData): ReviewStatus {
  const reasons: string[] = [];
  let penalty = 0;

  const warnings = table.warnings ?? [];
  // Each repair warning means the LLM got the structure wrong and a heuristic
  // had to patch it — those tables are exactly where review pays off.
  const repairWarnings = warnings.filter((w) => /rebuilt|restored|corrected|filled down|merged/i.test(w));
  if (repairWarnings.length >= 3) { penalty += 0.30; reasons.push(`${repairWarnings.length} structural repairs applied`); }
  else if (repairWarnings.length >= 1) { penalty += 0.15; reasons.push(`${repairWarnings.length} structural repair applied`); }

  const headerRows = table.headerRows ?? [];
  const flatHeaders = table.headers ?? [];
  const emptyHeaders = flatHeaders.filter((h) => !h?.trim()).length;
  if (flatHeaders.length && emptyHeaders / flatHeaders.length > 0.5) {
    penalty += 0.20; reasons.push('most header cells are empty');
  }
  if (headerRows.length === 0) { penalty += 0.10; reasons.push('no header row detected'); }

  // Column count mismatch between header and data means the columns cannot
  // line up — the exact failure mode users have reported.
  if (table.rows.length) {
    const bad = table.rows.filter((r) => r.length !== table.columnCount).length;
    if (bad > 0) { penalty += 0.15; reasons.push(`${bad} row(s) have a different column count`); }
  }

  // A header line whose text looks like a prose sentence is a coordinate
  // rebuild mistake we have observed on real PDFs.
  const prose = flatHeaders.some((h) => (h ?? '').length > 40 && /\s/.test(h ?? ''));
  if (prose) { penalty += 0.20; reasons.push('header contains prose text'); }

  const score = Math.max(0, Math.min(1, 1 - penalty));
  const level: ConfidenceLevel = score < 0.6 ? 'low' : score < 0.85 ? 'medium' : 'high';
  return { level, score, reasons };
}
