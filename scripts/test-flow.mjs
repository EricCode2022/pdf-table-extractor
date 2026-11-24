const BASE = 'http://127.0.0.1:3000';

async function main() {
  const pdf = await import('fs').then((fs) => fs.readFileSync('test-table.pdf'));

  console.log('1) UPLOAD');
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'test-table.pdf');
  const upRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  const up = await upRes.json();
  console.log('   status:', upRes.status, JSON.stringify(up));
  if (!upRes.ok) return;

  console.log('2) EXTRACT');
  const exRes = await fetch(`${BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm: false }),
  });
  const ex = await exRes.json();
  console.log('   status:', exRes.status);
  console.log('   tables:', ex.tables?.length, 'pages:', ex.totalPages);
  if (ex.tables?.length) {
    const t = ex.tables[0];
    console.log('   table_1:', `${t.rowCount} rows x ${t.columnCount} cols`, 'confidence:', t.confidence);
    console.log('   headers:', JSON.stringify(t.headers));
    console.log('   first row:', JSON.stringify(t.rows[0]));
    console.log('   warnings:', JSON.stringify(t.warnings));
  }
  if (!exRes.ok || !ex.tables?.length) return;

  console.log('3) EXPORT XLSX');
  const xRes = await fetch(`${BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'xlsx', tables: ex.tables, fileName: up.fileName }),
  });
  const x = await xRes.json();
  console.log('   status:', xRes.status, JSON.stringify(x));

  console.log('4) EXPORT CSV');
  const cRes = await fetch(`${BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'csv', tables: ex.tables, fileName: up.fileName }),
  });
  const c = await cRes.json();
  console.log('   status:', cRes.status, JSON.stringify(c));

  console.log('5) DOWNLOAD CSV');
  const dRes = await fetch(`${BASE}${c.url}`);
  const text = await dRes.text();
  const ct = dRes.headers.get('content-type') ?? '';
  const cd = dRes.headers.get('content-disposition') ?? '';
  console.log('   status:', dRes.status, 'content-type:', ct, 'content-disposition:', cd);
  console.log('   preview:', JSON.stringify(text.slice(0, 120)));
  const mimeOk = ct.includes('text/csv');
  const downloadOk = cd.includes('attachment');
  console.log('   MIME_OK:', mimeOk, 'DOWNLOAD_HEADER_OK:', downloadOk);
  if (!mimeOk || !downloadOk) process.exitCode = 1;
}

main().catch((e) => console.error('FAILED:', e));
