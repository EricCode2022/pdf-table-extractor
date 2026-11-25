// Structural evaluation: compare GT LaTeX tables with API-extracted tables.
// Both sides are normalised to a logical grid with colSpan/rowSpan spans so
// that "content right but structure wrong" is no longer invisible.

import fs from 'fs';
import path from 'path';
import { parseLatexTable } from './latex-table-parser.mjs';

const BASE = 'http://127.0.0.1:3000';
const DIR = path.join('tests', 'real-pdfs');

function normalise(s) {
  return (s ?? '').replace(/[_{}^\\$]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function tokens(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(/-?\d[\d,]*\.?\d*/g)) out.add(m[0].replace(/,/g, ''));
  for (const m of String(text ?? '').matchAll(/[A-Za-z]{3,}/g)) out.add(m[0].toLowerCase());
  return out;
}

// Adapt a TableData into { cols, rows, spans } using the same inference the UI
// and Excel export use: repeated text across adjacent columns => colSpan,
// repeated text across adjacent rows => rowSpan, child-only merge requires
// matching parents.
function adaptPrediction(t) {
  const cols = t.columnCount;
  const headerRows = (t.headerRows?.length ? t.headerRows : [t.headers ?? []]).map((r) =>
    Array.from({ length: cols }, (_, c) => normalise(r[c]))
  );
  const dataRows = (t.rows ?? []).map((r) => Array.from({ length: cols }, (_, c) => normalise(r[c])));
  const grid = [...headerRows, ...dataRows];
  const headerCount = headerRows.length;
  const covered = grid.map(() => Array(cols).fill(false));
  for (let r = 1; r < grid.length; r++) {
    for (let c = 0; c < cols; c++) {
      const cur = grid[r][c];
      if (cur && cur === grid[r - 1][c]) covered[r][c] = true;
    }
  }
  const rowSpanAt = (r, c) => {
    let span = 1;
    for (let rr = r + 1; rr < grid.length && covered[rr][c]; rr++) span++;
    return span;
  };
  const spans = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < cols; c++) {
      if (covered[r][c]) continue;
      const text = grid[r][c];
      const rowSpan = rowSpanAt(r, c);
      let colSpan = 1;
      while (
        c + colSpan < cols && !covered[r][c + colSpan] &&
        grid[r][c + colSpan] === text && text && rowSpanAt(r, c + colSpan) === rowSpan &&
        // child rows only merge when their parent cells match
        (r === 0 || r >= headerCount || (grid[r - 1][c] && grid[r - 1][c] === grid[r - 1][c + colSpan]))
      ) colSpan++;
      if (colSpan > 1 || rowSpan > 1) spans.push({ row: r, col: c, colSpan, rowSpan, text });
    }
  }
  return { cols, rows: grid, spans, headerCount };
}

function matchTables(gtTables, predTables) {
  // Greedy one-to-one match by token overlap (a prediction can serve one GT).
  const pairs = [];
  for (let g = 0; g < gtTables.length; g++) {
    const gtTok = tokens(gtTables[g].data);
    for (let p = 0; p < predTables.length; p++) {
      const pTok = tokens([...(predTables[p].headers ?? []), ...(predTables[p].rows ?? []).flat()].join(' '));
      let hit = 0;
      for (const t of gtTok) if (pTok.has(t)) hit++;
      pairs.push({ g, p, score: hit / Math.max(1, gtTok.size) });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedG = new Set(), usedP = new Set(), matched = [];
  for (const pair of pairs) {
    if (usedG.has(pair.g) || usedP.has(pair.p)) continue;
    if (pair.score < 0.25) continue;
    usedG.add(pair.g); usedP.add(pair.p);
    matched.push(pair);
  }
  return matched;
}

function spanKey(s) {
  return `${s.row}:${s.col}:${s.colSpan > 1 ? `c${s.colSpan}` : ''}${s.rowSpan > 1 ? `r${s.rowSpan}` : ''}`;
}

function compareTable(gt, pred) {
  const g = parseLatexTable(gt.data);
  const p = adaptPrediction(pred);
  const colOk = g.cols === p.cols;
  const rowDiff = Math.abs(g.rows.length - p.rows.length);
  const rowOk = rowDiff <= 1;

  // Cell content accuracy: evaluate at every small row offset and keep the
  // best. This separates "content wrong" from "header row count wrong", which
  // would otherwise shift every data row and tank the naive score.
  const cellAt = (shift) => {
    let hit = 0, total = 0;
    for (let r = 0; r < g.rows.length; r++) {
      const pr = r + shift;
      if (pr < 0 || pr >= p.rows.length) continue;
      for (let c = 0; c < Math.min(g.cols, p.cols); c++) {
        const a = normalise(g.rows[r][c]);
        const b = p.rows[pr][c];
        if (!a && !b) continue;
        total++;
        if (a && b && (a === b || a.includes(b) || b.includes(a))) hit++;
      }
    }
    return total ? { acc: hit / total, total } : { acc: 0, total: 0 };
  };
  let cellHit = 0, cellTotal = 0, bestShift = 0, strictHit = 0, strictTotal = 0;
  for (let shift = -3; shift <= 3; shift++) {
    const { acc, total } = cellAt(shift);
    if (acc > cellHit / (cellTotal || 1)) { cellHit = acc * total; cellTotal = total; bestShift = shift; }
  }
  const strict = cellAt(0);
  strictHit = strict.acc * strict.total; strictTotal = strict.total;

  // Span F1: exact (row, col, colSpan/rowSpan) match.
  const gSpans = new Set(g.spans.filter((s) => s.colSpan > 1 || s.rowSpan > 1).map(spanKey));
  const pSpans = new Set(p.spans.map(spanKey));
  let tp = 0;
  for (const k of pSpans) if (gSpans.has(k)) tp++;
  const spanP = pSpans.size ? tp / pSpans.size : 0;
  const spanR = gSpans.size ? tp / gSpans.size : 0;
  const spanF1 = spanP + spanR ? 2 * spanP * spanR / (spanP + spanR) : 0;
  return {
    colOk, rowOk, cellAcc: cellTotal ? cellHit / cellTotal : 0,
    strictCell: strictTotal ? strictHit / strictTotal : 0, shift: bestShift,
    spanF1, gCols: g.cols, pCols: p.cols, gRows: g.rows.length, pRows: p.rows.length,
    gSpans: gSpans.size, pSpans: pSpans.size, tp,
  };
}

async function run(file, enableLlm) {
  const pdf = fs.readFileSync(path.join(DIR, file));
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), file);
  const up = await (await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })).json();
  const res = await fetch(`${BASE}/api/extract`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm }),
  });
  return res.json();
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.pdf')).sort();
  const agg = { n: 0, col: 0, row: 0, cell: 0, span: 0, gtTables: 0, predTables: 0, matched: 0 };
  const byComplexity = {};
  console.log('name  gt pred match  col%  row%  cellStrict/best  spanF1');
  for (const file of files) {
    const name = file.replace(/\.pdf$/, '');
    const gt = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.gt.json`), 'utf8'));
    const gtTables = gt.filter((e) => e.type === 'table');
    let ex;
    try { ex = await run(file, true); }
    catch (e) { console.log(`${name} ERROR ${e.message}`); continue; }
    const predTables = ex.tables ?? [];
    const matched = matchTables(gtTables, predTables);
    let col = 0, row = 0, cell = 0, strict = 0, span = 0, shift0 = 0;
    for (const { g, p } of matched) {
      const r = compareTable(gtTables[g], predTables[p]);
      col += r.colOk ? 1 : 0; row += r.rowOk ? 1 : 0; cell += r.cellAcc; strict += r.strictCell; span += r.spanF1;
      if (r.shift === 0) shift0++;
      const c = gtTables[g].complexity ?? 'unknown';
      const b = byComplexity[c] ?? (byComplexity[c] = { n: 0, col: 0, row: 0, cell: 0, strict: 0, span: 0 });
      b.n++; b.col += r.colOk ? 1 : 0; b.row += r.rowOk ? 1 : 0; b.cell += r.cellAcc; b.strict += r.strictCell; b.span += r.spanF1;
    }
    const n = matched.length || 1;
    console.log(`${name.padEnd(5)} ${String(gtTables.length).padStart(2)} ${String(predTables.length).padStart(4)} ${String(matched.length).padStart(5)}  ${String(Math.round(col/n*100)).padStart(3)}  ${String(Math.round(row/n*100)).padStart(3)}  ${(strict/n*100).toFixed(1).padStart(5)}/${(cell/n*100).toFixed(1).padStart(4)}  ${(span/n*100).toFixed(1).padStart(5)}`);
    agg.n += files.length > 0 ? 1 : 0;
    agg.gtTables += gtTables.length; agg.predTables += predTables.length; agg.matched += matched.length;
    agg.col += col; agg.row += row; agg.cell += cell; agg.strict = (agg.strict ?? 0) + strict; agg.span += span; agg.shift0 = (agg.shift0 ?? 0) + shift0;
  }
  const n = agg.matched || 1;
  console.log(`\n=== STRUCTURE: matched=${agg.matched}/${agg.gtTables} gt, ${agg.predTables} predicted, exact row align=${agg.shift0}/${agg.matched}`);
  console.log(`col=${(agg.col/n*100).toFixed(1)}%  row(±1)=${(agg.row/n*100).toFixed(1)}%`);
  console.log(`cell strict=${((agg.strict??0)/n*100).toFixed(1)}%  cell bestShift=${(agg.cell/n*100).toFixed(1)}%  spanF1=${(agg.span/n*100).toFixed(1)}%`);
  for (const [c, b] of Object.entries(byComplexity)) {
    console.log(`  ${c.padEnd(8)} n=${b.n}  col=${(b.col/b.n*100).toFixed(0)}%  cellStrict=${(b.strict/b.n*100).toFixed(1)}%  cellBest=${(b.cell/b.n*100).toFixed(1)}%  spanF1=${(b.span/b.n*100).toFixed(1)}%`);
  }
}
main().catch((e) => { console.error('CRASHED:', e); process.exitCode = 1; });
