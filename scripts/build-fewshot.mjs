// Build few-shot examples from exported Review Sets.
//
// Usage: node scripts/build-fewshot.mjs <review-set.json> [more.json ...]
//
// A Review Set is exported by the UI's "Review Set" button after a human has
// confirmed/corrected tables. We turn the *corrected* tables into compact
// structure exemplars (headerRows + rows) that teach the LLM the expected
// multi-level header / column-count conventions. Only high-signal examples
// are kept: multi-level headers, or wide tables, with consistent column counts.

import fs from 'fs';
import path from 'path';

const OUT = path.join('data', 'fewshot-examples.json');
const MAX_EXAMPLES = 12;

function columnCount(t) {
  const fromHeader = (t.headerRows?.[0] ?? t.headers ?? []).length;
  const fromRows = Math.max(0, ...(t.rows ?? []).map((r) => r.length));
  return Math.max(fromHeader, fromRows);
}

function isGoodExample(t) {
  const cols = columnCount(t);
  if (cols < 2 || cols > 12) return false;
  const rows = t.rows ?? [];
  if (rows.length < 1) return false;
  // Must have real data (at least one numeric-ish cell) to be a useful exemplar.
  const hasData = rows.some((r) => r.some((v) => /\d/.test(v ?? '')));
  if (!hasData) return false;
  // All rows must line up with the column count — that is the convention we
  // want the model to learn.
  if (rows.some((r) => r.length !== cols)) return false;
  const hRows = t.headerRows ?? [];
  if (hRows.some((hr) => hr.length !== cols)) return false;
  // Prefer structurally interesting examples.
  return hRows.length >= 2 || (t.headers ?? []).some((h) => h.includes('/')) || cols >= 5;
}

function toExample(t) {
  const cols = columnCount(t);
  const trimRow = (r) => Array.from({ length: cols }, (_, c) => String(r?.[c] ?? ''));
  const hRows = (t.headerRows?.length ? t.headerRows : [t.headers ?? []]).map(trimRow);
  // Cap rows to keep the prompt small: 2 header lines + 3 data lines is enough
  // to demonstrate structure.
  return {
    columns: cols,
    headerRows: hRows.slice(0, 3),
    rows: (t.rows ?? []).slice(0, 3).map(trimRow),
  };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/build-fewshot.mjs <review-set.json> [more.json ...]');
  process.exit(1);
}

const seen = new Set();
const examples = [];
for (const file of files) {
  if (!fs.existsSync(file)) { console.warn(`skip missing: ${file}`); continue; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tables = Array.isArray(data) ? data : (data.tables ?? []);
  for (const t of tables) {
    if (!isGoodExample(t)) continue;
    const ex = toExample(t);
    // Deduplicate by structure signature so many corrections of the same
    // table layout don't crowd out other patterns.
    const sig = JSON.stringify([ex.columns, ex.headerRows, ex.rows]);
    if (seen.has(sig)) continue;
    seen.add(sig);
    examples.push(ex);
    if (examples.length >= MAX_EXAMPLES) break;
  }
  if (examples.length >= MAX_EXAMPLES) break;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), examples }, null, 2));
console.log(`wrote ${examples.length} few-shot examples to ${OUT}`);
