import fs from 'fs';
import path from 'path';
import { makePdf } from './lib/pdf-writer.mjs';

const OUT = path.join('tests', 'samples');
fs.mkdirSync(OUT, { recursive: true });

function write(name, pages, expected) {
  const buf = makePdf(pages);
  fs.writeFileSync(path.join(OUT, `${name}.pdf`), buf);
  fs.writeFileSync(path.join(OUT, `${name}.expected.json`), JSON.stringify(expected, null, 2));
  console.log(`${name}.pdf  ${buf.length} bytes`);
}

// 1. Simple bordered grid
write('01-simple-bordered', [
  { rows: [
    ['Item', 'Qty', 'Price'],
    ['Apple', '12', '1.50'],
    ['Banana', '8', '0.99'],
  ], bordered: true },
], { tables: 1, headers: ['Item', 'Qty', 'Price'], rows: 2 });

// 2. Borderless table
write('02-borderless', [
  { rows: [
    ['Name', 'Department', 'Score'],
    ['Alice', 'Finance', '92'],
    ['Bob', 'Engineering', '88'],
    ['Carol', 'Sales', '76'],
  ] },
], { tables: 1, headers: ['Name', 'Department', 'Score'], rows: 3 });

// 3. Currency, dates, decimals
write('03-currency-dates', [
  { rows: [
    ['Date', 'Description', 'Amount', 'Tax'],
    ['2026-01-01', 'Office supplies', '$120.00', '9.60'],
    ['2026-01-02', 'Software', '$89.50', '7.16'],
    ['2026-02-01', 'Marketing', '$1,250.00', '100.00'],
  ], colWidth: 140 },
], { tables: 1, headers: ['Date', 'Description', 'Amount', 'Tax'], rows: 3 });

// 4. Blank cells
write('04-blank-cells', [
  { rows: [
    ['Code', 'Name', 'Note', 'Value'],
    ['A001', 'Alpha', '', '10'],
    ['A002', 'Beta', 'n/a', ''],
    ['A003', 'Gamma', '', '30'],
  ] },
], { tables: 1, headers: ['Code', 'Name', 'Note', 'Value'], rows: 3 });

// 5. Multi-page (one table per page)
write('05-multipage', [
  { rows: [['Region', 'Sales'], ['East', '120'], ['West', '95']] },
  { rows: [['Region', 'Sales'], ['North', '80'], ['South', '110']] },
], { tables: 2, headers: ['Region', 'Sales'], rows: 2 });

// 6. Two tables on one page (separated vertically)
write('06-two-tables-one-page', [
  { rows: [
    ['Product', 'Price'],
    ['Widget', '10'],
    ['Gadget', '20'],
    ['', ''],
    ['', ''],
    ['Service', 'Rate'],
    ['Setup', '100'],
  ], yTop: 740, rowHeight: 22 },
], { tables: 1, note: 'single continuous grid; split-table detection is a known limitation' });

// 7. No header (all data rows)
write('07-no-header', [
  { rows: [
    ['2026-01-01', 'Coffee', '5.00'],
    ['2026-01-02', 'Paper', '12.00'],
    ['2026-01-03', 'Pen', '2.50'],
  ] },
], { tables: 1, note: 'first data row may be treated as header by rule engine' });

// 8. Corrupted file (error-handling sample)
fs.writeFileSync(path.join(OUT, '08-corrupted.pdf'), '%PDF-1.4\nthis is not a valid pdf\n');
fs.writeFileSync(path.join(OUT, '08-corrupted.expected.json'), JSON.stringify({ shouldFail: true }, null, 2));
console.log('08-corrupted.pdf  (error-handling sample)');
