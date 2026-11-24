import ExcelJS from 'exceljs';
import type { TableData } from '@/types/table';

export async function buildExcel(tables: TableData[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDF Table Extractor';
  workbook.created = new Date();

  const usedNames = new Set<string>();
  tables.forEach((table, index) => {
    let name = `Table ${index + 1}`;
    let suffix = 1;
    while (usedNames.has(name)) name = `Table ${index + 1} (${suffix++})`;
    usedNames.add(name);

    const sheet = workbook.addWorksheet(name.slice(0, 31));
    const headerRows = table.headerRows?.filter((hr) => hr.some((h) => h.trim() !== ''));
    if (headerRows && headerRows.length > 0) {
      const cols = Math.max(...headerRows.map((hr) => hr.length));
      const textAt = (ri: number, c: number) => (headerRows[ri]?.[c] ?? '').trim();

      // A cell equal to the one directly above it is covered by that cell's rowSpan.
      const covered = headerRows.map((_, ri) =>
        Array.from({ length: cols }, (_, c) => ri > 0 && textAt(ri, c) !== '' && textAt(ri, c) === textAt(ri - 1, c))
      );
      const rowSpanAt = (ri: number, c: number): number => {
        let span = 1;
        for (let r = ri + 1; r < headerRows.length && covered[r][c]; r++) span++;
        return span;
      };

      headerRows.forEach((hr, ri) => {
        sheet.addRow(Array.from({ length: cols }, (_, c) => (covered[ri][c] ? '' : hr[c] ?? '')));
      });

      headerRows.forEach((_, ri) => {
        let c = 0;
        while (c < cols) {
          if (covered[ri][c]) { c++; continue; }
          const text = textAt(ri, c);
          const rowSpan = rowSpanAt(ri, c);
          let colSpan = 1;
          while (
            c + colSpan < cols &&
            !covered[ri][c + colSpan] &&
            textAt(ri, c + colSpan) === text &&
            rowSpanAt(ri, c + colSpan) === rowSpan &&
            text !== '' &&
            // Child cells merge only when their parents match; two "Overall"
            // under different parent groups must remain separate.
            (ri === 0 || (textAt(ri - 1, c) !== '' && textAt(ri - 1, c) === textAt(ri - 1, c + colSpan)))
          ) colSpan++;
          if (rowSpan > 1 || colSpan > 1) {
            sheet.mergeCells(ri + 1, c + 1, ri + rowSpan, c + colSpan);
            sheet.getCell(ri + 1, c + 1).alignment = { horizontal: 'center', vertical: 'middle' };
          }
          c += colSpan;
        }
      });
    } else if (table.headers.some((h) => h.trim() !== '')) {
      sheet.addRow(table.headers);
    }
    const headerLineCount = headerRows?.length ?? (table.headers.some((h) => h.trim() !== '') ? 1 : 0);
    for (const row of table.rows) sheet.addRow(row);
    // Merge vertically repeated first-column text labels (multirow cells).
    if (table.rows.length > 1) {
      let start = 0;
      while (start < table.rows.length) {
        const value = table.rows[start][0] ?? '';
        if (!value || /^[\d.,%+\-]+$/.test(value)) { start++; continue; }
        let end = start + 1;
        while (end < table.rows.length && (table.rows[end][0] ?? '') === value) end++;
        if (end - start > 1) {
          const top = headerLineCount + start + 1;
          const bottom = headerLineCount + end;
          sheet.mergeCells(top, 1, bottom, 1);
          sheet.getCell(top, 1).alignment = { horizontal: 'center', vertical: 'middle' };
        }
        start = end;
      }
    }

    sheet.columns.forEach((column) => {
      let max = 10;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = len;
      });
      column.width = Math.min(max + 2, 60);
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
