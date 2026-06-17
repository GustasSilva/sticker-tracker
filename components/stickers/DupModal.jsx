'use client';
import { useState } from 'react';
import { PLAYER_NAMES, TEAM_ISO } from '@/data/players';

export default function DupModal({ code, teamCode, teamName, totalInitial, onSave, onClose }) {
  const [total, setTotal] = useState(totalInitial);
  const name    = PLAYER_NAMES[code] || '';
  const isOwned = total >= 1;
  const extras  = Math.max(0, total - 1);

  const statusText = total === 0
    ? 'Não tenho'
    : total === 1 ? 'Tenho (sem repetidas)'
    : `Tenho + ${extras} repetida${extras > 1 ? 's' : ''}`;

  return (
    <div className="dup-modal-backdrop" onClick={onClose}>
      <div className="dup-modal" onClick={e => e.stopPropagation()}>
        <div className="dup-modal-header">
          {TEAM_ISO[teamCode]
            ? <span className={`fi fi-${TEAM_ISO[teamCode]} dup-modal-flag`} />
            : <span className="dup-modal-flag-emoji">{teamCode === 'FWC' ? '🏆' : '🥤'}</span>
          }
          <div className="dup-modal-id">
            <span className="dup-modal-code">{code}</span>
            <span className="dup-modal-team">{teamName}</span>
          </div>
        </div>
        {name && <div className="dup-modal-name">{name}</div>}
        <div className="dup-modal-controls">
          <button className="dup-modal-btn" onClick={() => setTotal(t => Math.max(0, t - 1))}>−</button>
          <span className="dup-modal-qty">{total}</span>
          <button className="dup-modal-btn" onClick={() => setTotal(t => t + 1)}>+</button>
        </div>
        <div className={`dup-modal-status ${isOwned ? (extras > 0 ? 'has-rep' : 'is-owned') : 'not-owned'}`}>
          {statusText}
        </div>
        <div className="dup-modal-dots">
          {isOwned && <span className="dup-dot green" />}
          {Array.from({ length: Math.min(extras, 6) }, (_, i) => <span key={i} className="dup-dot amber" />)}
          {extras > 6 && <span className="dup-dot-more">+{extras - 6}</span>}
        </div>
        {extras > 0 && (
          <div className="dup-trade-badge">
            {extras} cópia{extras > 1 ? 's' : ''} disponível{extras > 1 ? 'is' : ''} para troca
          </div>
        )}
        <div className="dup-modal-actions">
          {extras > 0 && (
            <button className="dup-modal-zero" onClick={() => setTotal(1)}>Zerar repetidas</button>
          )}
          <button className="dup-modal-save" onClick={() => onSave(code, total)}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
