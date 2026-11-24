import React from 'react';

// Renders a_{b} as a<sub>b</sub> and a^{b} as a<sup>b</sup>.
// Falls back to plain text when no markup is present.
export function RichCell({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /_\{([^{}]{1,20})\}|\^\{([^{}]{1,20})\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<sub key={key++} className="text-[0.75em]">{m[1]}</sub>);
    } else if (m[2] !== undefined) {
      parts.push(<sup key={key++} className="text-[0.75em]">{m[2]}</sup>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.length ? parts : text}</>;
}
