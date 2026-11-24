// Minimal PDF writer: multiple pages, positioned text, optional grid lines.
export function makePdf(pages) {
  // pages: Array<{ rows: string[][], x?: number, yTop?: number, colWidth?: number, rowHeight?: number, bordered?: boolean }>
  const objects = [];
  const push = (s) => { objects.push(s); return objects.length; };

  // Reserve: 1 catalog, 2 pages, 3 font, then per-page content + page objects.
  const fontId = 3;
  const pageIds = [];
  const contentStreams = [];

  for (const pg of pages) {
    const x0 = pg.x ?? 72;
    const yTop = pg.yTop ?? 720;
    const colWidth = pg.colWidth ?? 150;
    const rowHeight = pg.rowHeight ?? 24;
    const rows = pg.rows;
    const cols = Math.max(...rows.map((r) => r.length), 1);

    let stream = '';
    if (pg.bordered) {
      const width = cols * colWidth;
      const height = rows.length * rowHeight;
      for (let i = 0; i <= cols; i++) {
        const x = x0 + i * colWidth;
        stream += `${x} ${yTop - height} m ${x} ${yTop} l S\n`;
      }
      for (let j = 0; j <= rows.length; j++) {
        const y = yTop - j * rowHeight;
        stream += `${x0} ${y} m ${x0 + width} ${y} l S\n`;
      }
    }
    rows.forEach((row, r) => {
      const y = yTop - r * rowHeight - rowHeight * 0.7;
      row.forEach((cell, c) => {
        if (!cell) return;
        const safe = String(cell).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        stream += `BT /F1 11 Tf ${x0 + c * colWidth + 4} ${y} Td (${safe}) Tj ET\n`;
      });
    });
    contentStreams.push(stream);
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${contentStreams.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${contentStreams.length} >>`;
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  contentStreams.forEach((stream, i) => {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
