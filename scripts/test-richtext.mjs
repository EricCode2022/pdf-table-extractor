import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const { reconstructRichText } = await import('../lib/pdf/richtext.ts');

const name = process.argv[2] ?? '005';
const targetY = Number(process.argv[3] ?? 131);
const buf = fs.readFileSync(`tests/real-pdfs/${name}.pdf`);
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
const content = await page.getTextContent();
const cells = [];
for (const item of content.items) {
  if (!('str' in item) || !item.str.trim()) continue;
  const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
  cells.push({
    text: item.str.trim(),
    x: tx[4], y: tx[5],
    width: Math.abs(tx[2]) + Math.abs(item.width * vp.scale),
    height: Math.abs(tx[3]) || item.height * vp.scale,
  });
}
const row = cells.filter((c) => Math.abs(c.y - targetY) < 5);
console.log(`=== ${name} y=${targetY} original (${row.length}) ===`);
console.log(row.sort((a, b) => a.x - b.x).map((c) => c.text).join(' | '));
console.log(`=== reconstructed (${reconstructRichText(row).length}) ===`);
console.log(reconstructRichText(row).map((c) => c.richText).join(' | '));
void doc.destroy();
