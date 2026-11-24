import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const name = process.argv[2] ?? '000';
const targetY = Number(process.argv[3] ?? 69);
const buf = fs.readFileSync(`tests/real-pdfs/${name}.pdf`);
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
const content = await page.getTextContent();
const cells = [];
for (const item of content.items) {
  if (!('str' in item) || !item.str.trim()) continue;
  const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
  cells.push({ t: item.str.trim(), x: tx[4], y: tx[5] });
}
console.log(`Row y=${targetY}:`);
for (const c of cells.filter((c) => Math.abs(c.y - targetY) < 2).sort((a, b) => a.x - b.x)) {
  console.log(`  x=${c.x.toFixed(1)}  ${c.t}`);
}
void doc.destroy();
