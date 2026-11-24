import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
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

async function extract(pdfPath, name) {
  const pdf = fs.readFileSync(pdfPath);
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), name);
  const upRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  const up = await upRes.json();
  if (!upRes.ok) throw new Error(`upload: ${up.error}`);
  const exRes = await fetch(`${BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm: false }),
  });
  const ex = await exRes.json();
  if (!exRes.ok) throw new Error(`extract: ${ex.error}`);
  return ex;
}

async function main() {
  const pdfs = fs.readdirSync(DIR).filter((f) => f.endsWith('.pdf')).sort();
  const rows = [];
  let totalGtTables = 0;
  let totalGotTables = 0;
  let totalTokens = 0;
  let totalMatched = 0;

  for (const pdf of pdfs) {
    const name = pdf.replace(/\.pdf$/, '');
    const gt = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.gt.json`), 'utf8'));
    const { tableCount, tokens } = gtTokens(gt);
    let ex;
    try {
      ex = await extract(path.join(DIR, pdf), pdf);
    } catch (e) {
      rows.push({ name, error: e.message });
      continue;
    }
    const gotTables = ex.tables?.length ?? 0;
    const gotText = (ex.tables ?? [])
      .flatMap((t) => [...(t.headers ?? []), ...(t.rows ?? []).flat()])
      .join(' ');
    const gotTokens = keyTokens(gotText);
    let matched = 0;
    for (const tok of tokens) if (gotTokens.has(tok)) matched++;
    const recall = tokens.size ? matched / tokens.size : 0;
    rows.push({ name, gtTables: tableCount, gotTables, tokens: tokens.size, matched, recall });
    totalGtTables += tableCount;
    totalGotTables += gotTables;
    totalTokens += tokens.size;
    totalMatched += matched;
  }

  console.log('name       gtTbl gotTbl  tokens matched recall');
  for (const r of rows) {
    if (r.error) { console.log(`${r.name}  ERROR ${r.error}`); continue; }
    console.log(
      `${r.name}   ${String(r.gtTables).padStart(4)} ${String(r.gotTables).padStart(5)}  ` +
      `${String(r.tokens).padStart(6)} ${String(r.matched).padStart(7)} ${(r.recall * 100).toFixed(1).padStart(6)}%`
    );
  }
  console.log(`\nTOTAL gt tables=${totalGtTables} got tables=${totalGotTables} | token recall=${totalMatched}/${totalTokens} = ${(totalMatched / totalTokens * 100).toFixed(1)}%`);
}

main().catch((e) => { console.error('CRASHED:', e); process.exitCode = 1; });
