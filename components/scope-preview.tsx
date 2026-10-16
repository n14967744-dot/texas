'use client';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function ScopePreview({ scope }: { scope: string | null }) {
  const id = useId();
  const tooltip = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function show() {
    const rect = trigger.current!.getBoundingClientRect();
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 452)), top: rect.bottom > window.innerHeight - 260 ? Math.max(12, rect.top - 248) : rect.bottom });
  }
  if (!scope?.trim()) return <span className="muted">Not listed</span>;
  return <>
    <button ref={trigger} className="scope-preview" aria-describedby={position ? id : undefined}
      onMouseEnter={show} onFocus={show} onBlur={() => setPosition(null)}
      onMouseLeave={(e) => { if (!(e.relatedTarget instanceof Node && tooltip.current?.contains(e.relatedTarget))) setPosition(null); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setPosition(null); } }}
      onClick={(e) => { e.stopPropagation(); show(); }}>{scope}</button>
    {position && createPortal(<div ref={tooltip} id={id} role="tooltip" className="scope-tooltip" style={position}
      onMouseLeave={() => setPosition(null)}><strong>Scope / description</strong><p>{scope}</p></div>, document.body)}
  </>;
}
