import type { ReactNode } from "react";

// WhatsApp formatting: *bold*, _italic_, ~strike~, ```monospace```. Rendered as React
// elements (never HTML strings), so template text can't inject markup.

const TOKEN = /(```[^`]+```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

export function WhatsAppText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${m.index}`;
    if (t.startsWith("```")) parts.push(<code key={key} className="font-mono text-[0.95em]">{t.slice(3, -3)}</code>);
    else if (t.startsWith("*")) parts.push(<strong key={key}>{t.slice(1, -1)}</strong>);
    else if (t.startsWith("_")) parts.push(<em key={key}>{t.slice(1, -1)}</em>);
    else parts.push(<s key={key}>{t.slice(1, -1)}</s>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
