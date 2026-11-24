import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const name = process.argv[2] ?? '000';
const buf = fs.readFileSync(`tests/real-pdfs/${name}.pdf`);
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
console.log(`=== ${name} === pages: ${doc.numPages}`);
for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const cells = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
    cells.push({ t: item.str.trim(), x: Math.round(tx[4]), y: Math.round(tx[5]) });
  }
  const ys = [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);
  const xs = [...new Set(cells.map((c) => c.x))].sort((a, b) => a - b);
  console.log(`page ${i}: ${cells.length} cells, size ${Math.round(vp.width)}x${Math.round(vp.height)}`);
  console.log(`  y range: ${ys[0]} - ${ys[ys.length - 1]} distinct=${ys.length}`);
  console.log(`  x range: ${xs[0]} - ${xs[xs.length - 1]} distinct=${xs.length}`);
  console.log('  sample:', JSON.stringify(cells.slice(0, 10)));
}
void doc.destroy();
