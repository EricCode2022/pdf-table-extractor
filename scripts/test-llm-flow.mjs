import fs from 'fs';

const BASE = 'http://127.0.0.1:3000';
const name = process.argv[2] ?? '000';
const enableLlm = process.argv[3] !== 'false';

const pdf = fs.readFileSync(`tests/real-pdfs/${name}.pdf`);
const form = new FormData();
form.append('file', new Blob([pdf], { type: 'application/pdf' }), `${name}.pdf`);
const up = await (await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })).json();
if (!up.key) { console.error('upload failed', up); process.exit(1); }
const started = Date.now();
const exRes = await fetch(`${BASE}/api/extract`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm }),
});
const ex = await exRes.json();
console.log(`=== ${name} enableLlm=${enableLlm} ===`);
console.log('status:', exRes.status, 'latency:', Date.now() - started, 'ms');
console.log('tables:', ex.tables?.length);
console.log('llmErrors:', JSON.stringify(ex.llmErrors ?? []));
for (const t of ex.tables ?? []) {
  console.log(`  [${t.id}] source=${t.source} page=${t.page} ${t.rowCount}x${t.columnCount} headers=${JSON.stringify(t.headers)} warnings=${JSON.stringify(t.warnings)}`);
}
