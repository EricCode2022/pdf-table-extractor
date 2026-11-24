import fs from 'fs';
import path from 'path';

const BASE = 'http://127.0.0.1:3000';
const DIR = path.join('tests', 'real-pdfs');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.pdf')).sort();

let totalLatency = 0;
for (const file of files) {
  const pdf = fs.readFileSync(path.join(DIR, file));
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), file);
  const up = await (await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })).json();
  const started = Date.now();
  const ex = await (await fetch(`${BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm: true }),
  })).json();
  const latency = Date.now() - started;
  totalLatency += latency;
  const sources = (ex.tables ?? []).reduce((m, t) => { m[t.source] = (m[t.source] ?? 0) + 1; return m; }, {});
  console.log(`${file}: tables=${ex.tables?.length ?? 0} sources=${JSON.stringify(sources)} latency=${latency}ms`);
}
console.log(`TOTAL latency=${totalLatency}ms avg=${Math.round(totalLatency / files.length)}ms`);
