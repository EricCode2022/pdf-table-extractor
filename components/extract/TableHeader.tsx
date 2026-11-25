import React from 'react';
import { RichCell } from './RichCell';

type HeaderLine = { plain: string[]; rich?: string[] };

// Renders multi-level table headers. The LLM repeats parent text across the columns
// (horizontal) and rows (vertical) it spans; we merge identical neighbouring cells
// with colSpan / rowSpan so the result matches the original layout.
export function TableHeader({
  headerRows,
  headerRowsRich,
  headers,
  headersRich,
  columnCount,
  editing,
  draftHeaders,
  onEdit,
}: {
  headerRows?: string[][];
  headerRowsRich?: string[][];
  headers: string[];
  headersRich?: string[];
  columnCount: number;
  editing: boolean;
  draftHeaders?: string[];
  onEdit?: (c: number, value: string) => void;
}) {
  if (editing) {
    return (
      <tr className="bg-slate-50">
        {(draftHeaders ?? headers).map((h, c) => (
          <th key={c} className="border-b border-line text-center px-3 py-2.5 font-normal whitespace-nowrap">
            <input
              value={h}
              onChange={(e) => onEdit?.(c, e.target.value)}
              className="w-full border border-line rounded px-1 py-0.5 bg-white text-center"
            />
          </th>
        ))}
      </tr>
    );
  }

  const lines: HeaderLine[] = headerRows && headerRows.length > 0
    ? headerRows.map((hr, ri) => ({ plain: hr, rich: headerRowsRich?.[ri] }))
    : [{ plain: headers, rich: headersRich }];

  const textAt = (ri: number, c: number) => (lines[ri]?.plain[c] ?? '').trim();

  // A cell equal to the one directly above it is covered by that cell's rowSpan.
  const covered: boolean[][] = lines.map(() => Array.from({ length: columnCount }, () => false));
  for (let ri = 1; ri < lines.length; ri++) {
    for (let c = 0; c < columnCount; c++) {
      const current = textAt(ri, c);
      if (current && current === textAt(ri - 1, c)) covered[ri][c] = true;
    }
  }

  const rowSpanAt = (ri: number, c: number): number => {
    let span = 1;
    for (let r = ri + 1; r < lines.length && covered[r][c]; r++) span++;
    return span;
  };

  return (
    <>
      {lines.map((line, ri) => {
        const cells: React.ReactNode[] = [];
        let c = 0;
        while (c < columnCount) {
          if (covered[ri][c]) { c++; continue; }
          const text = textAt(ri, c);
          const rowSpan = rowSpanAt(ri, c);
          let colSpan = 1;
          while (
            c + colSpan < columnCount &&
            !covered[ri][c + colSpan] &&
            textAt(ri, c + colSpan) === text &&
            rowSpanAt(ri, c + colSpan) === rowSpan &&
            text !== '' &&
            // A child cell may only merge with a neighbour when their parent
            // cells are also identical; e.g. two "Overall" under different
            // parents (GenEval / DPG) must stay separate as in the source PDF.
            (ri === 0 || (textAt(ri - 1, c) !== '' && textAt(ri - 1, c) === textAt(ri - 1, c + colSpan)))
          ) colSpan++;

          cells.push(
            <th
              key={`${ri}-${c}`}
              colSpan={colSpan}
              rowSpan={rowSpan}
              className={`border-b border-line px-3 py-2.5 font-normal whitespace-nowrap text-center ${
                ri === lines.length - 1 ? 'bg-slate-50' : 'bg-white'
              }`}
            >
              {text ? <RichCell text={line.rich?.[c] ?? text} /> : ''}
            </th>
          );
          c += colSpan;
        }
        return cells.length ? <tr key={ri}>{cells}</tr> : null;
      })}
    </>
  );
}
