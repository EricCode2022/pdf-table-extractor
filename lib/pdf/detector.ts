import type { PageData, TextCell } from './parser';
import type { TableData } from '@/types/table';

const ROW_TOLERANCE = 4;
const COL_TOLERANCE = 6;

function cluster(values: number[], tolerance: number): number[] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const centers: number[] = [sorted[0]];
  for (const v of sorted.slice(1)) {
    if (v - centers[centers.length - 1] <= tolerance) continue;
    centers.push(v);
  }
  return centers;
}

function nearest(value: number, centers: number[], tolerance: number): number {
  for (let i = 0; i < centers.length; i++) {
    if (Math.abs(value - centers[i]) <= tolerance) return i;
  }
  return -1;
}

type Candidate = {
  rows: number;
  cols: number;
  cells: TextCell[];
  xCenters: number[];
  yCenters: number[];
  score: number;
};

function detectCandidates(page: PageData): Candidate[] {
  const { cells } = page;
  if (cells.length < 4) return [];

  const yCenters = cluster(cells.map((c) => c.y), ROW_TOLERANCE);
  const xCenters = cluster(cells.map((c) => c.x), COL_TOLERANCE);
  if (yCenters.length < 2 || xCenters.length < 2) return [];

  const grid: (TextCell | null)[][] = Array.from({ length: yCenters.length }, () =>
    Array.from({ length: xCenters.length }, () => null)
  );

  for (const cell of cells) {
    const r = nearest(cell.y, yCenters, ROW_TOLERANCE);
    const c = nearest(cell.x, xCenters, COL_TOLERANCE);
    if (r >= 0 && c >= 0) grid[r][c] = cell;
  }

  const filled = grid.flat().filter(Boolean).length;
  const density = filled / (grid.length * grid[0].length);
  const score = Math.min(1, density * 1.5);
  if (density < 0.25) return [];

  return [{ rows: grid.length, cols: grid[0].length, cells, xCenters, yCenters, score }];
}

function splitByVerticalGaps(cells: TextCell[]): TextCell[][] {
  if (cells.length < 4) return [cells];

  const yCenters = cluster(cells.map((c) => c.y), ROW_TOLERANCE);
  if (yCenters.length < 3) return [cells];

  const gaps: number[] = [];
  for (let i = 1; i < yCenters.length; i++) {
    gaps.push(yCenters[i] - yCenters[i - 1]);
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const splitThreshold = Math.max(medianGap * 2.5, ROW_TOLERANCE * 5);

  const boundaries = gaps
    .map((gap, i) => (gap > splitThreshold ? (yCenters[i] + yCenters[i + 1]) / 2 : null))
    .filter((b): b is number => b !== null);
  if (!boundaries.length) return [cells];

  const groups: TextCell[][] = [];
  let remaining = cells;
  for (const boundary of boundaries) {
    groups.push(remaining.filter((c) => c.y < boundary));
    remaining = remaining.filter((c) => c.y >= boundary);
  }
  groups.push(remaining);
  return groups;
}

export function detectTables(pages: PageData[]): TableData[] {
  const tables: TableData[] = [];
  let tableIndex = 0;

  for (const page of pages) {
    const groups = splitByVerticalGaps(page.cells);
    for (const group of groups) {
    for (const candidate of detectCandidates({ ...page, cells: group })) {
      tableIndex += 1;
      const { rows, cols, cells, xCenters, yCenters, score } = candidate;
      const grid: string[][] = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => '')
      );

      for (const cell of cells) {
        const r = nearest(cell.y, yCenters, ROW_TOLERANCE);
        const c = nearest(cell.x, xCenters, COL_TOLERANCE);
        if (r >= 0 && c >= 0) grid[r][c] = grid[r][c] ? `${grid[r][c]} ${cell.text}` : cell.text;
      }

      const warnings: string[] = [];
      const firstRow = grid[0]?.slice() ?? [];

      const isDateLike = (v: string) => /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v);
      const isValueLike = (v: string) =>
        /^[\s$¥€£]*-?\d[\d,]*(\.\d+)?[\s%]?$/.test(v) || isDateLike(v);
      const filledFirstRow = firstRow.filter((h) => h.trim() !== '');
      const valueLikeCount = filledFirstRow.filter((h) => isValueLike(h.trim())).length;
      const firstRowIsData =
        filledFirstRow.length > 0 &&
        valueLikeCount / filledFirstRow.length >= 0.6 &&
        grid.length > 1;

      let headers: string[];
      let dataRows: string[][];
      if (firstRowIsData) {
        headers = [];
        dataRows = grid.slice();
        warnings.push('Header row is missing; first row treated as data');
      } else {
        headers = firstRow;
        dataRows = grid.slice(1);
        if (headers.every((h) => !h)) warnings.push('Header row is missing');
      }

      for (let c = 0; c < cols; c++) {
        let numericCount = 0;
        let filledCount = 0;
        for (const row of dataRows) {
          const v = row[c]?.trim();
          if (!v) continue;
          filledCount += 1;
          if (/^[\s$¥€£]*-?\d[\d,]*(\.\d+)?[\s%]?$/.test(v)) numericCount += 1;
        }
        if (filledCount > 0 && numericCount > 0 && numericCount < filledCount * 0.6) {
          warnings.push(`Column ${c + 1} has inconsistent number formats`);
        }
      }

      const cleanRows = dataRows.filter((row) => row.some((v) => v.trim() !== ''));

      tables.push({
        id: `table_${tableIndex}`,
        page: page.pageNumber,
        rowCount: cleanRows.length + (headers.some((h) => h) ? 1 : 0),
        columnCount: cols,
        headers,
        rows: cleanRows,
        confidence: score,
        source: 'rules',
        warnings,
      });
    }
    }
  }

  return tables;
}
