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
    const hasHeaders = table.headers.some((h) => h.trim() !== '');
    if (hasHeaders) sheet.addRow(table.headers);
    for (const row of table.rows) sheet.addRow(row);

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
