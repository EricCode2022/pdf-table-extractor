import React from 'react';
import { RichCell } from './RichCell';

type HeaderLine = { plain: string[]; rich?: string[] };

// Renders multi-level table headers. Adjacent identical cells in a header row are
// merged with colSpan (the LLM repeats parent text across the columns it spans).
export function TableHeader({
  headerRows,
  headers,
  headersRich,
  columnCount,
  editing,
  draftHeaders,
  onEdit,
}: {
  headerRows?: string[][];
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
          <th key={c} className="border-b border-line text-left px-3 py-2.5 font-normal whitespace-nowrap">
            <input
              value={h}
              onChange={(e) => onEdit?.(c, e.target.value)}
              className="w-full border border-line rounded px-1 py-0.5 bg-white"
            />
          </th>
        ))}
      </tr>
    );
  }

  const lines: HeaderLine[] = headerRows && headerRows.length > 0
    ? headerRows.map((hr, i) => ({ plain: hr, rich: undefined }))
    : [{ plain: headers, rich: headersRich }];

  return (
    <>
      {lines.map((line, ri) => {
        const cells: React.ReactNode[] = [];
        let c = 0;
        while (c < columnCount) {
          const text = line.plain[c] ?? '';
          let span = 1;
          while (c + span < columnCount && (line.plain[c + span] ?? '') === text && text.trim() !== '') span++;
          cells.push(
            <th
              key={`${ri}-${c}`}
              colSpan={span}
              className={`border-b border-line text-left px-3 py-2.5 font-normal whitespace-nowrap ${
                ri === lines.length - 1 ? 'bg-slate-50' : 'bg-white'
              }`}
            >
              {text ? <RichCell text={line.rich?.[c] ?? text} /> : ''}
            </th>
          );
          c += span;
        }
        return <tr key={ri}>{cells}</tr>;
      })}
    </>
  );
}
