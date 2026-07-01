'use client';
import { useState } from 'react';

const OPTIONS = [
  ['album',      'Álbum (padrão)'],
  ['owned_desc', 'Mais marcadas'],
  ['owned_asc',  'Menos marcadas'],
  ['dups_desc',  'Mais repetidas'],
  ['dups_asc',   'Menos repetidas'],
];

export default function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find(o => o[0] === value) || OPTIONS[0];
  const active  = value !== 'album';

  return (
    <div className="sort-dd">
      <button type="button"
        className={`sort-dd-trigger${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        title="Ordenar seções">
        <span className="sort-dd-ico">⇅</span>
        <span className="sort-dd-label">{active ? current[1] : 'Ordenar'}</span>
        <span className="sort-dd-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="sort-dd-backdrop" onClick={() => setOpen(false)} />
          <div className="sort-dd-menu" role="listbox">
            {OPTIONS.map(([val, label]) => (
              <button key={val} type="button" role="option" aria-selected={val === value}
                className={`sort-dd-item${val === value ? ' is-selected' : ''}`}
                onClick={() => { onChange(val); setOpen(false); }}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
