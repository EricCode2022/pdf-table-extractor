import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const name = process.argv[2] ?? '003';
const needle = process.argv[3] ?? 'Baseline';
const buf = fs.readFileSync(`tests/real-pdfs/${name}.pdf`);
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
const content = await page.getTextContent();
const cells = [];
for (const item of content.items) {
  if (!('str' in item) || !item.str.trim()) continue;
  const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
  cells.push({ text: item.str.trim(), x: tx[4], y: tx[5], width: Math.abs(tx[2]) + Math.abs(item.width * vp.scale), height: item.height * vp.scale });
}
const target = cells.find((c) => c.text.includes(needle));
if (!target) { console.log('not found'); process.exit(0); }
console.log('target:', JSON.stringify(target));
console.log('nearby (same row):');
for (const c of cells.filter((c) => Math.abs(c.y - target.y) < 3 && c.x > target.x).sort((a,b)=>a.x-b.x).slice(0, 6)) {
  console.log(`  ${c.text} x=${Math.round(c.x)} gap=${Math.round(c.x - (target.x + target.width))}`);
}
void doc.destroy();
