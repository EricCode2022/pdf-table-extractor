import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const name = process.argv[2] ?? '000';
const buf = fs.readFileSync(`tests/real-pdfs/${name}.pdf`);
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
const content = await page.getTextContent();
const cells = [];
for (const item of content.items) {
  if (!('str' in item) || !item.str.trim()) continue;
  const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
  cells.push({ text: item.str.trim(), x: tx[4], y: tx[5], width: Math.abs(tx[2]) + Math.abs(item.width * vp.scale), height: Math.abs(tx[3]) || item.height * vp.scale });
}

function cluster(values, tol) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const centers = [sorted[0]];
  for (const v of sorted.slice(1)) if (v - centers[centers.length - 1] > tol) centers.push(v);
  return centers;
}
function nearest(v, centers, tol) {
  for (let i = 0; i < centers.length; i++) if (Math.abs(v - centers[i]) <= tol) return i;
  return -1;
}

const ROW = 4, COL = 6;
const yCenters = cluster(cells.map((c) => c.y), ROW);
const xCenters = cluster(cells.map((c) => c.x), COL);
const grid = Array.from({ length: yCenters.length }, () => Array.from({ length: xCenters.length }, () => null));
for (const c of cells) {
  const r = nearest(c.y, yCenters, ROW), col = nearest(c.x, xCenters, COL);
  if (r >= 0 && col >= 0) grid[r][col] = c;
}
const filled = grid.flat().filter(Boolean).length;
console.log(`=== ${name} full-page grid ===`);
console.log(`cells=${cells.length} yClusters=${yCenters.length} xClusters=${xCenters.length} grid=${grid.length}x${grid[0].length} filled=${filled} density=${(filled / (grid.length * grid[0].length)).toFixed(3)}`);
console.log(`ROW_TOLERANCE=${ROW} COL_TOLERANCE=${COL}`);

const gaps = [];
for (let i = 1; i < yCenters.length; i++) gaps.push(yCenters[i] - yCenters[i - 1]);
const sorted = [...gaps].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(`median row gap=${median.toFixed(1)} max gap=${Math.max(...gaps).toFixed(1)} splitThreshold=${Math.max(median * 2.5, ROW * 5).toFixed(1)}`);
console.log(`gaps > threshold: ${gaps.filter((g) => g > Math.max(median * 2.5, ROW * 5)).length}`);
void doc.destroy();
