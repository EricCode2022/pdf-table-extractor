import React from 'react';

type Segment = { text: string; kind: 'text' | 'sub' | 'sup' };

function parseMarkup(text: string): Segment[] {
  const segments: Segment[] = [];
  let plain = '';
  let i = 0;

  while (i < text.length) {
    const isSub = text.startsWith('_{', i);
    const isSup = text.startsWith('^{', i);
    if (!isSub && !isSup) {
      plain += text[i++];
      continue;
    }

    const open = i + 1;
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text.startsWith('_{', j) || text.startsWith('^{', j)) { depth++; j += 2; }
      else if (text[j] === '}') { depth--; j++; }
      else j++;
    }
    if (depth !== 0) {
      plain += text.slice(i, j);
      i = j;
      continue;
    }

    if (plain) { segments.push({ text: plain, kind: 'text' }); plain = ''; }
    const inner = text.slice(open + 1, j - 1);
    segments.push({ text: inner, kind: isSub ? 'sub' : 'sup' });
    i = j;
  }
  if (plain) segments.push({ text: plain, kind: 'text' });
  return segments;
}

// Renders a_{b} as a<sub>b</sub> and a^{b} as a<sup>b</sup>, including nested markup.
export function RichCell({ text }: { text: string }) {
  const segments = parseMarkup(text);
  if (segments.length === 0) return <>{text}</>;

  const renderInner = (seg: Segment, key: number): React.ReactNode => {
    const innerSegments = parseMarkup(seg.text);
    if (innerSegments.length <= 1 && innerSegments[0]?.kind === 'text') return seg.text;
    return <>{innerSegments.map((s, i) => renderSegment(s, `${key}-${i}`))}</>;
  };

  const renderSegment = (seg: Segment, key: string): React.ReactNode => {
    if (seg.kind === 'text') return seg.text;
    if (seg.kind === 'sub') return <sub key={key} className="text-[0.75em]">{renderInner(seg, 0)}</sub>;
    return <sup key={key} className="text-[0.75em]">{renderInner(seg, 0)}</sup>;
  };

  return <>{segments.map((seg, i) => renderSegment(seg, String(i)))}</>;
}
