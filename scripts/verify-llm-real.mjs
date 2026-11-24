import fs from 'fs';
import path from 'path';

const BASE = 'http://127.0.0.1:3000';
const DIR = path.join('tests', 'real-pdfs');

function keyTokens(text) {
  const out = new Set();
  for (const m of text.matchAll(/-?\d[\d,]*\.?\d*/g)) out.add(m[0].replace(/,/g, ''));
  for (const m of text.matchAll(/[A-Za-z]{3,}/g)) out.add(m[0].toLowerCase());
  return out;
}
function gtTokens(gt) {
  const tables = gt.filter((e) => e.type === 'table');
  const tokens = new Set();
  for (const t of tables) for (const tok of keyTokens(t.data)) tokens.add(tok);
  return { tableCount: tables.length, tokens };
}

async function run(file, enableLlm) {
  const pdf = fs.readFileSync(path.join(DIR, file));
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), file);
  const up = await (await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })).json();
  const started = Date.now();
  const res = await fetch(`${BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm }),
  });
  const ex = await res.json();
  return { ex, latency: Date.now() - started };
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.pdf')).sort();
  let gtTotal = 0, gotTotal = 0, tokenTotal = 0, matchedTotal = 0, latencyTotal = 0;

  console.log('name  gtTbl gotTbl  recall  source        latency');
  for (const file of files) {
    const name = file.replace(/\.pdf$/, '');
    const gt = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.gt.json`), 'utf8'));
    const { tableCount, tokens } = gtTokens(gt);
    let out;
    try { out = await run(file, true); }
    catch (e) { console.log(`${name}  ERROR ${e.message}`); continue; }
    const tables = out.ex.tables ?? [];
    const sources = tables.reduce((m, t) => { m[t.source] = (m[t.source] ?? 0) + 1; return m; }, {});
    const gotTokens = keyTokens(tables.flatMap((t) => [...(t.headers ?? []), ...(t.rows ?? []).flat()]).join(' '));
    let matched = 0;
    for (const tok of tokens) if (gotTokens.has(tok)) matched++;
    const recall = tokens.size ? matched / tokens.size : 0;
    console.log(`${name.padEnd(5)} ${String(tableCount).padStart(4)} ${String(tables.length).padStart(5)}  ${(recall*100).toFixed(1).padStart(5)}%  ${JSON.stringify(sources).padEnd(14)} ${out.latency}ms`);
    gtTotal += tableCount; gotTotal += tables.length; tokenTotal += tokens.size; matchedTotal += matched; latencyTotal += out.latency;
  }
  console.log(`\n=== LLM MODE: gt tables=${gtTotal} got tables=${gotTotal} | recall=${matchedTotal}/${tokenTotal}=${(matchedTotal/tokenTotal*100).toFixed(1)}% | avg latency=${Math.round(latencyTotal/files.length)}ms ===`);
  console.log('(baseline rule-only: recall=18.1%, got tables=7)');
}
main().catch((e) => { console.error('CRASHED:', e); process.exitCode = 1; });
