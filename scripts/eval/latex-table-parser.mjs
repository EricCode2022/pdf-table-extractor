// Parse a LaTeX tabular into a logical grid with colSpan/rowSpan coverage.
//   { cols, rows: string[][], spans: { row, col, colSpan, rowSpan, text }[] }
// `rows` is the fully-expanded grid: covered cells carry the master's text,
// matching how the app repeats parent labels for colSpan/rowSpan.

function readBraced(src, pos) {
  // src[pos] === '{'; return the balanced content and index after '}'.
  if (src[pos] !== '{') return { value: '', end: pos + 1 };
  let depth = 0;
  for (let i = pos; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return { value: src.slice(pos + 1, i), end: i + 1 };
    }
  }
  return { value: src.slice(pos + 1), end: src.length };
}

function stripCommands(cmdSrc) {
  // Remove LaTeX commands with N brace arguments, keeping nothing (rules,
  // formatting wrappers are handled separately in plainText).
  let s = cmdSrc;
  const argCount = {
    multicolumn: 3, multirow: 3, cellcolor: 1, textcolor: 1, color: 1,
    textbf: 1,textit: 1, emph: 1, mathrm: 1, mathbf: 1, textsc: 1,
    underline: 1, mbox: 1, makebox: 2, makecell: 1, text: 1, operatorname: 1,
  };
  for (const [name, n] of Object.entries(argCount)) {
    const re = new RegExp(`\\\\${name}(?:\\[[^\\]]*\\])?`, 'g');
    let guard = 0;
    let m;
    while ((m = re.exec(s)) && guard++ < 50) {
      let p = m.index + m[0].length;
      let content = '';
      for (let k = 0; k < n; k++) {
        while (s[p] && /\s/.test(s[p])) p++;
        if (s[p] === '{') {
          const b = readBraced(s, p);
          content = k === n - 1 ? b.value : content;
          p = b.end;
        } else break;
      }
      // Preserve the final argument's content as plain markup for plainText.
      const replacement = n && content ? content : '';
      s = s.slice(0, m.index) + replacement + s.slice(p);
      re.lastIndex = m.index + replacement.length;
    }
  }
  return s;
}

function plainText(s) {
  let out = stripCommands(s);
  out = out.replace(/\\(?:top|mid|bottom)rule(?:\[[^\]]*\])?/g, '')
    .replace(/\\(?:cmidrule|cline)(?:\([^)]*\))?(?:\[[^\]]*\])?(?:\{[^}]*\})+/g, '')
    .replace(/\\hline/g, '')
    .replace(/\\(?:noalign|multicolumn|multirow|rowcolor|columncolor)(?:\([^)]*\))?(?:\[[^\]]*\])?(?:\{[^}]*\})*/g, '');
  out = out.replace(/\$/g, '');
  out = out.replace(/\\(?:dagger|circ|ast|cdot|times|pm|approx|leq|geq|infty|ldots|quad|qquad|,|;|!|:)/g, (m) => ({
    '\\dagger': '', '\\circ': 'o', '\\ast': '*', '\\cdot': '', '\\times': 'x',
    '\\pm': '+/-', '\\approx': '~', '\\leq': '<=', '\\geq': '>=', '\\infty': 'inf',
    '\\ldots': '...', '\\quad': ' ', '\\qquad': ' ', '\\,': ' ', '\\;': ' ',
    '\\!': '', '\\:': ' ',
  }[m] ?? ''));
  out = out.replace(/\^\{?([A-Za-z0-9]+)\}?/g, '$1').replace(/_\{?([A-Za-z0-9]+)\}?/g, '$1');
  out = out.replace(/[{}\\]/g, '');
  return out.replace(/\s+/g, ' ').trim();
}

// Split a tabular body into physical rows at top-level `\\`.
function splitRows(body) {
  const rows = [];
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && body[i + 1] === '\\') {
      rows.push(cur); cur = ''; i++; continue;
    }
    cur += body[i];
  }
  rows.push(cur);
  return rows;
}

function splitCells(row) {
  const cells = [];
  let depth = 0, math = 0, cur = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '&') { cur += ' '; i++; continue; }
    if (ch === '$') { math ^= 1; cur += ch; continue; }
    if (!math && ch === '{') { depth++; cur += ch; continue; }
    if (!math && ch === '}') { depth--; cur += ch; continue; }
    if (ch === '&' && depth === 0 && math === 0) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
  return cells;
}

function parseCell(raw) {
  let s = raw.trim();
  let colSpan = 1, rowSpan = 1;
  const mc = s.match(/^\\multicolumn\s*\{(\d+)\}/);
  if (mc) {
    colSpan = parseInt(mc[1], 10);
    let p = mc[0].length;
    // Skip the alignment argument {c}/{r}/{c|}, then read the content argument.
    while (/\s/.test(s[p] ?? '')) p++;
    p = readBraced(s, p).end;
    while (/\s/.test(s[p] ?? '')) p++;
    s = readBraced(s, p).value;
  }
  const mr = s.match(/^\\multirow\s*\{([\d.]+)\}/);
  if (mr) {
    rowSpan = Math.max(1, Math.round(parseFloat(mr[1])));
    let p = mr[0].length;
    // Skip the width argument {*}, then read the content argument.
    while (/\s/.test(s[p] ?? '')) p++;
    p = readBraced(s, p).end;
    while (/\s/.test(s[p] ?? '')) p++;
    s = readBraced(s, p).value;
  }
  return { text: plainText(s), colSpan, rowSpan };
}

export function parseLatexTable(data) {
  const spec = data.match(/\\begin\{tabular\}\s*\{([^}]*)\}/)?.[1] ?? '';
  const cols = spec.replace(/@\{[^}]*\}/g, '').replace(/>/g, '').replace(/\|/g, '')
    .replace(/\{[^}]*\}/g, '').replace(/\s/g, '').length;
  const begin = data.indexOf('\\begin{tabular}');
  const end = data.lastIndexOf('\\end{tabular}');
  let body = begin >= 0 && end > begin ? data.slice(data.indexOf('{', begin + 15) + 1, end) : data;
  // Remove the column-spec part: find the matching } of the first { after begin.
  const specEnd = readBraced(data, data.indexOf('{', begin + 15)).end;
  body = data.slice(specEnd, end);

  const grid = [];
  const spans = [];
  for (const rawRow of splitRows(body)) {
    // Strip rules from anywhere in the line, not only at its start: LaTeX
    // often puts \toprule and the first header row on the same physical line.
    const line = rawRow
      .replace(/\\(?:top|mid|bottom)rule(?:\[[^\]]*\])?/g, '')
      .replace(/\\(?:cmidrule|cline)(?:\([^)]*\))?(?:\[[^\]]*\])?(?:\{[^}]*\})+/g, '')
      .replace(/\\hline/g, '')
      .trim();
    if (!line) continue;
    const cells = splitCells(line);
    const row = [];
    for (const raw of cells) {
      const parsed = parseCell(raw);
      if (!parsed.text && parsed.colSpan === 1 && parsed.rowSpan === 1 && row.length === 0 && cells.length === 1) continue;
      spans.push({ row: grid.length, col: row.length, colSpan: parsed.colSpan, rowSpan: parsed.rowSpan, text: parsed.text });
      for (let k = 0; k < parsed.colSpan; k++) row.push(parsed.text);
    }
    while (row.length < cols) row.push('');
    grid.push(row.slice(0, cols));
  }
  for (const sp of spans) {
    for (let r = sp.row + 1; r < Math.min(grid.length, sp.row + sp.rowSpan); r++) {
      if (grid[r]?.[sp.col] !== undefined) grid[r][sp.col] = sp.text;
    }
  }
  return { cols, rows: grid, spans };
}
