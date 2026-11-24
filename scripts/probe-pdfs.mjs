import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const files = process.argv.slice(2);
for (const file of files) {
  try {
    const buf = fs.readFileSync(file);
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
    let textItems = 0;
    let rows = new Set();
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ('str' in item && item.str.trim()) {
          textItems++;
          rows.add(Math.round(item.transform[5]));
        }
      }
    }
    console.log(`${path.basename(file)} | pages=${doc.numPages} | textItems=${textItems} | distinctRows=${rows.size} | size=${buf.length}B`);
    void doc.destroy();
  } catch (e) {
    console.log(`${path.basename(file)} | ERROR: ${e.message}`);
  }
}
