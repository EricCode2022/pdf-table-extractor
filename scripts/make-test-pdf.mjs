import fs from 'fs';

// Minimal PDF with positioned text forming a simple 3-column table.
const rows = [
  ['Date', 'Description', 'Amount'],
  ['2026-01-01', 'Office supplies', '120.00'],
  ['2026-01-02', 'Software', '89.00'],
  ['2026-01-03', 'Marketing', '250.00'],
];

const content = rows
  .map((row, r) => {
    const y = 750 - r * 24;
    return row
      .map((cell, c) => `BT /F1 11 Tf ${72 + c * 160} ${y} Td (${cell}) Tj ET`)
      .join('\n');
  })
  .join('\n');

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];

let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((obj, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i <= objects.length; i++) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

fs.writeFileSync('test-table.pdf', pdf, 'latin1');
console.log('Created test-table.pdf', Buffer.byteLength(pdf), 'bytes');
