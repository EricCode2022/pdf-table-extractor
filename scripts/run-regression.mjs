import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const SAMPLES = path.join('tests', 'samples');

function normalize(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

async function uploadAndExtract(filePath, fileName) {
  const pdf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), fileName);
  const upRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  const up = await upRes.json();
  if (!upRes.ok) return { error: `upload: ${up.error}` };

  const exRes = await fetch(`${BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: up.key, fileName: up.fileName, enableLlm: false }),
  });
  const ex = await exRes.json();
  if (!exRes.ok) return { error: `extract: ${ex.error}`, upload: up };
  return { result: ex, upload: up };
}

function grade(result, expected) {
  const tables = result.tables ?? [];
  const checks = [];
  checks.push({ name: 'table count', ok: tables.length === expected.tables, got: tables.length, want: expected.tables });
  if (expected.headers && tables[0]) {
    const got = (tables[0].headers ?? []).map(normalize);
    const want = expected.headers.map(normalize);
    checks.push({ name: 'headers', ok: JSON.stringify(got) === JSON.stringify(want), got, want });
  }
  if (expected.rows != null && tables[0]) {
    const got = tables[0].rows?.length ?? 0;
    checks.push({ name: 'data rows', ok: got === expected.rows, got, want: expected.rows });
  }
  if (expected.expectWarning && tables[0]) {
    const warnings = tables[0].warnings ?? [];
    checks.push({
      name: 'warning present',
      ok: warnings.some((w) => w.includes(expected.expectWarning)),
      got: warnings,
      want: expected.expectWarning,
    });
  }
  if (expected.tableDetails) {
    expected.tableDetails.forEach((detail, i) => {
      const table = tables[i];
      if (!table) {
        checks.push({ name: `table ${i + 1} exists`, ok: false, got: 'missing', want: 'present' });
        return;
      }
      if (detail.headers) {
        const got = (table.headers ?? []).map(normalize);
        const want = detail.headers.map(normalize);
        checks.push({ name: `table ${i + 1} headers`, ok: JSON.stringify(got) === JSON.stringify(want), got, want });
      }
      if (detail.rows != null) {
        checks.push({ name: `table ${i + 1} rows`, ok: (table.rows?.length ?? 0) === detail.rows, got: table.rows?.length, want: detail.rows });
      }
    });
  }
  const pass = checks.every((c) => c.ok);
  return { pass, checks };
}

async function main() {
  const files = fs.readdirSync(SAMPLES).filter((f) => f.endsWith('.pdf')).sort();
  let passed = 0;
  let failed = 0;
  let limitations = 0;
  const failures = [];

  for (const file of files) {
    const name = file.replace(/\.pdf$/, '');
    const expected = JSON.parse(fs.readFileSync(path.join(SAMPLES, `${name}.expected.json`), 'utf8'));
    process.stdout.write(`${name}: `);
    let out;
    try {
      out = await uploadAndExtract(path.join(SAMPLES, file), file);
    } catch (e) {
      out = { error: `network: ${e.message}` };
    }
    if (out.error) {
      if (expected.shouldFail) {
        console.log(`PASS (rejected as expected: ${out.error.slice(0, 60)})`);
        passed++;
      } else {
        console.log(`FAIL ${out.error}`);
        failed++;
        failures.push({ name, error: out.error });
      }
      continue;
    }
    const gradeResult = grade(out.result, expected);
    if (expected.knownLimitation) {
      if (gradeResult.pass) {
        console.log(`LIMITATION (expected behavior: ${expected.knownLimitation.slice(0, 50)}...)`);
        limitations++;
      } else {
        console.log('FAIL (limitation sample no longer matches expectation)');
        failed++;
        failures.push({ name, checks: gradeResult.checks.filter((c) => !c.ok) });
      }
      continue;
    }
    if (gradeResult.pass) {
      console.log(`PASS (confidence ${out.result.tables[0]?.confidence ?? 'n/a'})`);
      passed++;
    } else {
      console.log('FAIL');
      failed++;
      failures.push({ name, checks: gradeResult.checks.filter((c) => !c.ok) });
    }
  }

  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed, ${limitations} known limitations (total ${files.length}) ===`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.name}: ${JSON.stringify(f.error ?? f.checks)}`);
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('REGRESSION CRASHED:', e); process.exitCode = 1; });
