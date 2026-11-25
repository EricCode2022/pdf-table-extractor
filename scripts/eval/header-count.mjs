// Reliably count logical header rows in a GT LaTeX table: content rows from
// \toprule up to the first \midrule/\bottomrule. Rule-only rows don't count.
export function gtHeaderRowCount(data) {
  const begin = data.indexOf('\\begin{tabular}');
  const end = data.lastIndexOf('\\end{tabular}');
  const specEnd = begin >= 0 ? data.indexOf('}', data.indexOf('{', begin + 15)) + 1 : 0;
  const body = data.slice(specEnd, end >= 0 ? end : data.length);
  const lines = body.split(/\\\\/);
  let count = 0;
  for (const raw of lines) {
    // A rule appearing anywhere in the segment ends the header block. LaTeX
    // often writes `... \\ \midrule` so the rule shares a segment with the
    // following line's content.
    if (/\\(?:midrule|bottomrule)/.test(raw)) break;
    const content = raw
      .replace(/\\(?:toprule)(?:\[[^\]]*\])?/g, '')
      .replace(/\\(?:cmidrule|cline)(?:\([^)]*\))?(?:\[[^\]]*\])?(?:\{[^}]*\})+/g, '')
      .replace(/\\hline/g, '')
      .trim();
    if (content) count++;
  }
  return count;
}
