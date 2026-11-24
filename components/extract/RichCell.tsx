import React from 'react';

type Segment = { text: string; kind: 'text' | 'sub' | 'sup' | 'binom' };

function parseMarkup(text: string): Segment[] {
  const segments: Segment[] = [];
  let plain = '';
  let i = 0;

  while (i < text.length) {
    const isBinom = text.startsWith('\\binom{', i);
    const isSub = text.startsWith('_{', i);
    const isSup = text.startsWith('^{', i);
    if (!isBinom && !isSub && !isSup) {
      plain += text[i++];
      continue;
    }

    if (isBinom) {
      const topStart = i + '\\binom{'.length;
      const topEnd = text.indexOf('}', topStart);
      const bottomStart = topEnd < 0 ? -1 : topEnd + 1;
      if (text[bottomStart] !== '{') { plain += text[i++]; continue; }
      const bottomEnd = text.indexOf('}', bottomStart + 1);
      if (bottomEnd < 0) { plain += text[i++]; continue; }
      if (plain) { segments.push({ text: plain, kind: 'text' }); plain = ''; }
      segments.push({ text: text.slice(topStart, topEnd) + '|' + text.slice(bottomStart + 1, bottomEnd), kind: 'binom' });
      i = bottomEnd + 1;
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
    if (seg.kind === 'binom') {
      const [top, bottom] = seg.text.split('|');
      return (
        <span key={key} className="inline-flex items-center align-middle mx-0.5 font-normal">
          <span className="text-[1.4em] leading-none text-current/60">(</span>
          <span className="inline-flex flex-col items-center justify-center -mx-0.5">
            <span className="text-[0.72em] leading-tight px-0.5">{top}</span>
            <span className="text-[0.72em] leading-tight px-0.5 border-t border-current w-full text-center">{bottom}</span>
          </span>
          <span className="text-[1.4em] leading-none text-current/60">)</span>
        </span>
      );
    }
    if (seg.kind === 'sub') return <sub key={key} className="text-[0.75em]">{renderInner(seg, 0)}</sub>;
    return <sup key={key} className="text-[0.75em]">{renderInner(seg, 0)}</sup>;
  };

  return <>{segments.map((seg, i) => renderSegment(seg, String(i)))}</>;
}
