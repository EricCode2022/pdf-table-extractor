import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const buf = fs.readFileSync('tests/real-pdfs/005.pdf');
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
const content = await page.getTextContent();
for (const item of content.items.slice(0, 25)) {
  if (!('str' in item)) continue;
  const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
  console.log(JSON.stringify({
    text: item.str,
    x: Math.round(tx[4]),
    y: Math.round(tx[5]),
    height: Math.round(item.height * 10) / 10,
    width: Math.round(item.width * 10) / 10,
    fontName: item.fontName,
  }));
}
void doc.destroy();
