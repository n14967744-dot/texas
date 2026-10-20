'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const matches = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const pool = needle ? options.filter((option) => option.toLowerCase().includes(needle)) : options;
    return pool.slice(0, 40);
  }, [options, text]);

  function commit(next: string) {
    onChange(next);
    setText(next);
    setOpen(false);
  }

  return (
    <div className="combo" ref={root}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setText(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setOpen(false); setText(value); }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (matches.length === 1) commit(matches[0]);
            else if (!text.trim()) commit('');
          }
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (!root.current?.contains(document.activeElement)) setText(value);
          }, 120);
        }}
      />
      {value && <button type="button" className="combo-clear" aria-label={`Clear ${label}`} onClick={() => commit('')}>×</button>}
      {open && (
        <ul className="combo-list" role="listbox" aria-label={label}>
          <li><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => commit('')}>Any</button></li>
          {matches.map((option) => (
            <li key={option}>
              <button type="button" role="option" aria-selected={option === value} onMouseDown={(event) => event.preventDefault()} onClick={() => commit(option)}>{option}</button>
            </li>
          ))}
          {!matches.length && <li className="combo-empty">No matches</li>}
        </ul>
      )}
    </div>
  );
}
