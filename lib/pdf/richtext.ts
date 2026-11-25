import type { TextCell } from './parser';

export type RichCell = TextCell & { richText: string };

// Some PDFs render sub/superscripts only ~15% smaller than the base glyph
// (e.g. 6.3pt vs 7.4pt). A strict 0.75 ratio misses those; 0.92 still keeps
// normal same-size text from being mistaken for a script.
const SIZE_RATIO = 0.92;
const MAX_SUBSCRIPT_GAP = 5;

function isSubscript(a: TextCell, b: TextCell): boolean {
  if (b.height <= 0 || a.height <= 0) return false;
  if (b.height >= a.height * SIZE_RATIO) return false;
  const dy = b.y - a.y;
  if (dy < 0 || dy > MAX_SUBSCRIPT_GAP) return false;
  const gap = b.x - (a.x + a.width);
  return gap >= -2 && gap <= 3;
}

function isSuperscript(a: TextCell, b: TextCell): boolean {
  if (b.height <= 0 || a.height <= 0) return false;
  if (b.height >= a.height * SIZE_RATIO) return false;
  const dy = a.y - b.y;
  if (dy < 0 || dy > MAX_SUBSCRIPT_GAP) return false;
  const gap = b.x - (a.x + a.width);
  return gap >= -2 && gap <= 3;
}

function isSplitWord(a: TextCell, b: TextCell): boolean {
  const dy = Math.abs(a.y - b.y);
  if (dy > 2) return false;
  if (Math.abs(a.height - b.height) > 1.5) return false;
  const gap = b.x - (a.x + a.width);
  return gap >= -1 && gap <= 4;
}

function isMultiplyConnector(a: TextCell): boolean {
  return a.text === '×' || a.text === '·';
}

export function reconstructRichText(cells: TextCell[]): RichCell[] {
  const sorted = [...cells].sort((a, b) => a.x - b.x || a.y - b.y);
  const result: RichCell[] = [];
  let i = 0;

  while (i < sorted.length) {
    let current = sorted[i];
    let text = current.text;
    if (text.length <= 15 && /^[A-Za-z]{2,} [A-Za-z]$/.test(text)) {
      text = text.replace(' ', '');
    }
    let j = i + 1;

    while (j < sorted.length) {
      const next = sorted[j];
      if (isSubscript(current, next)) {
        text += `_{${next.text}}`;
        current = { ...current, width: next.x + next.width - current.x };
        j++;
        continue;
      }
      if (isSuperscript(current, next)) {
        text += `^{${next.text}}`;
        current = { ...current, width: next.x + next.width - current.x };
        j++;
        continue;
      }
      if (isMultiplyConnector(next) && text.length > 0) {
        const mulGap = next.x - (current.x + current.width);
        const after = sorted[j + 1];
        const afterGap = after ? after.x - (next.x + next.width) : Infinity;
        if (mulGap >= -1 && mulGap <= 4 && afterGap >= -1 && afterGap <= 4 && after) {
          text += `×${after.text}`;
          current = { ...current, width: after.x + after.width - current.x };
          j += 2;
          continue;
        }
      }
      if (isSplitWord(current, next)) {
        text += next.text;
        current = { ...current, width: next.x + next.width - current.x };
        j++;
        continue;
      }
      break;
    }

    result.push({ ...current, richText: text });
    i = j;
  }

  return result;
}

export function richCellText(cells: TextCell[]): string {
  return reconstructRichText(cells)
    .map((c) => c.richText)
    .join(' ');
}
