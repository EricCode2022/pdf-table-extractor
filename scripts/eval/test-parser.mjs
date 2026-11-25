import fs from 'fs';
import { parseLatexTable } from './latex-table-parser.mjs';
const gt = JSON.parse(fs.readFileSync('tests/real-pdfs/007.gt.json', 'utf8'));
const e = gt.filter((x) => x.type === 'table')[0];
console.log('RAW:', JSON.stringify(e.data.slice(0, 240)));
const t = parseLatexTable(e.data);
console.log('cols', t.cols, 'rows', t.rows.length);
console.log('spans', JSON.stringify(t.spans, null, 1));
t.rows.forEach((r,i)=>console.log(`r${i}`, JSON.stringify(r)));
