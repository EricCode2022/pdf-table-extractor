import Papa from 'papaparse';
import type { TableData } from '@/types/table';

function escapeCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

export function buildCsv(tables: TableData[]): string {
  const blocks: string[] = [];
  for (const [index, table] of tables.entries()) {
    const hasHeaders = table.headers.some((h) => h.trim() !== '');
    const rows = hasHeaders ? [table.headers, ...table.rows] : table.rows;
    const safe = rows.map((row) => row.map(escapeCell));
    const csv = Papa.unparse(safe, { quotes: true, newline: '\r\n' });
    blocks.push(`Table ${index + 1} (Page ${table.page})\r\n${csv}`);
  }
  return '\uFEFF' + blocks.join('\r\n\r\n');
}
