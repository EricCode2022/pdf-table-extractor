import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

export type TextCell = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PageData = {
  pageNumber: number;
  width: number;
  height: number;
  cells: TextCell[];
};

export async function parsePdf(buffer: Buffer, maxPages: number): Promise<PageData[]> {
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const pages: PageData[] = [];
  const count = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const cells: TextCell[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const t = item as TextItem;
      const tx = pdfjsLib.Util.transform(viewport.transform, t.transform);
      cells.push({
        text: t.str.trim(),
        x: tx[4],
        y: tx[5],
        width: Math.abs(tx[2]) + Math.abs(t.width * viewport.scale),
        height: Math.abs(tx[3]) || t.height * viewport.scale,
      });
    }
    pages.push({ pageNumber: i, width: viewport.width, height: viewport.height, cells });
  }
  void doc.destroy();
  return pages;
}
