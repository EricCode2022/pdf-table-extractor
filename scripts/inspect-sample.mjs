import fs from 'fs';

const BASE = 'http://127.0.0.1:3000';
const name = process.argv[2] ?? '06-two-tables-one-page';
const file = `tests/samples/${name}.pdf`;

const pdf = fs.readFileSync(file);
const form = new FormData();
form.append('file', new Blob([pdf], { type: 'application/pdf' }), `${name}.pdf`);
const up = await (await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })).json();
const ex = await (await fetch(`${BASE}/api/extract`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm: false }),
})).json();

console.log(`=== ${name} ===`);
console.log('tables:', ex.tables?.length);
for (const t of ex.tables ?? []) {
  console.log(`\n[${t.id}] page ${t.page}  ${t.rowCount}x${t.columnCount}  confidence ${t.confidence}`);
  console.log('headers:', JSON.stringify(t.headers));
  console.log('rows:', JSON.stringify(t.rows, null, 1));
  console.log('warnings:', JSON.stringify(t.warnings));
}
