import fs from 'fs';
const BASE = 'http://127.0.0.1:3000';
const name = process.argv[2] ?? '005';
const idx = Number(process.argv[3] ?? 0);
const pdf = fs.readFileSync(`tests/real-pdfs/${name}.pdf`);
const form = new FormData();
form.append('file', new Blob([pdf], { type: 'application/pdf' }), `${name}.pdf`);
const up = await (await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })).json();
const ex = await (await fetch(`${BASE}/api/extract`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm: true }),
})).json();
const t = ex.tables?.[idx];
if (!t) { console.log('no table', ex.tables?.length, ex.error, JSON.stringify(ex.llmErrors)); process.exit(0); }
console.log(`${name} table${idx}: ${t.rowCount}x${t.columnCount} source=${t.source}`);
console.log('headers:', JSON.stringify(t.headers));
console.log('rows:', JSON.stringify(t.rows.slice(0, 3)));
