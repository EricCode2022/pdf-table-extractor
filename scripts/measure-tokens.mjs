import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (name) => env.split('\n').find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim();
const key = get('LLM_API_KEY'), base = get('LLM_BASE_URL'), model = get('LLM_MODEL');

function keyTokens(text) {
  const out = new Set();
  for (const m of text.matchAll(/-?\d[\d,]*\.?\d*/g)) out.add(m[0].replace(/,/g, ''));
  for (const m of text.matchAll(/[A-Za-z]{3,}/g)) out.add(m[0].toLowerCase());
  return out;
}

const files = fs.readdirSync('tests/real-pdfs').filter((f) => f.endsWith('.pdf')).sort();
let totalIn = 0, totalOut = 0, totalCached = 0;

for (const file of files) {
  const name = file.replace(/\.pdf$/, '');
  const gt = JSON.parse(fs.readFileSync(`tests/real-pdfs/${name}.gt.json`, 'utf8'));
  const tableCount = gt.filter((e) => e.type === 'table').length;
  const tokens = new Set();
  for (const t of gt.filter((e) => e.type === 'table')) for (const tok of keyTokens(t.data)) tokens.add(tok);

  const buf = fs.readFileSync(`tests/real-pdfs/${file}`);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const cells = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
    cells.push({ t: item.str.trim(), x: Math.round(tx[4]), y: Math.round(tx[5]) });
  }
  void doc.destroy();

  // Mirror buildPagePrompt in lib/llm/fallback.ts (rule candidates empty for a conservative estimate).
  const prompt = [
    'Extract ALL tables from this PDF page. The page text items have (text, x, y) coordinates; y increases downward, x increases rightward.',
    'Group items into tables by spatial proximity. Multiple tables may appear side by side or stacked.',
    'Return ONLY JSON: {"tables":[{"headers":["..."],"rows":[["..."]],"confidence":0.0}]}',
    'Rules: do not invent data; preserve numbers exactly; if a table has no header, return headers: []; include every table you can find.',
    '', `Page number: 1`, `Page size: ${Math.round(vp.width)}x${Math.round(vp.height)}`,
    `Rule-engine candidates (may be incomplete or wrong): []`,
    `Text items with coordinates: ${JSON.stringify(cells)}`,
  ].join('\n');

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 8000, temperature: 0 }),
  });
  const body = await res.json();
  const u = body?.usage ?? {};
  totalIn += u.prompt_tokens ?? 0;
  totalOut += u.completion_tokens ?? 0;
  totalCached += u.prompt_cache_hit_tokens ?? 0;
  console.log(`${name}: prompt=${u.prompt_tokens} completion=${u.completion_tokens} cached=${u.prompt_cache_hit_tokens} gtTables=${tableCount}`);
}

const inputCost = totalIn / 1e6 * 0.28;
const cachedCost = totalCached / 1e6 * 0.028;
const outputCost = totalOut / 1e6 * 0.42;
console.log(`\nTOTAL input=${totalIn} cached=${totalCached} output=${totalOut}`);
console.log(`COST (12 PDFs, deepseek-chat $0.28/$0.42 per 1M, cache $0.028): $${(inputCost + outputCost).toFixed(4)} (cache-adjusted $${(inputCost - cachedCost + cachedCost + outputCost).toFixed(4)})`);
console.log(`avg per PDF: $${((inputCost + outputCost) / files.length).toFixed(4)}`);
