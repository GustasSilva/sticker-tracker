'use client';
import { memo, useState } from 'react';
import { PLAYER_NAMES, TEAM_ISO } from '@/data/players';
import { formatAgo, groupByTeam, codeNum } from '@/utils/stickers';

const BATCH_TYPES = ['batch_mark', 'batch_dup', 'open_pack', 'clear_dups', 'trade', 'reset_owned', 'reset_dups'];

const HistEntry = memo(function HistEntry({ entry, data, isFirst, onUndo }) {
  const [expanded, setExpanded] = useState(false);
  const ago  = formatAgo(entry.ts);
  const name = entry.code ? (PLAYER_NAMES[entry.code] || '') : '';
  const iso  = entry.teamCode ? TEAM_ISO[entry.teamCode] : null;

  const undoBtn = isFirst && !entry.isUndo
    ? <button className="hist-undo-btn" title="Desfazer" onClick={() => onUndo(entry)}>↩</button>
    : null;
  const undoBadge = entry.isUndo
    ? <span className="hist-badge hist-badge-undone">Desfeito</span>
    : null;

  if (BATCH_TYPES.includes(entry.type)) {
    const hasDetail    = entry.codes?.length > 0 && data;
    const expandGroups = expanded && hasDetail ? groupByTeam(entry.codes, data) : [];

    let dotCls, actionTxt;
    if (entry.type === 'batch_mark')       { dotCls = 'dot-green'; actionTxt = `${entry.count} coladas importadas`; }
    else if (entry.type === 'batch_dup')   { dotCls = 'dot-amber'; actionTxt = `${entry.count} repetidas importadas`; }
    else if (entry.type === 'open_pack')   { dotCls = 'dot-green'; actionTxt = `📦 ${entry.count} figurinhas — ${entry.newCount} novas · ${entry.dupCount} repetidas`; }
    else if (entry.type === 'trade') {
      dotCls = 'dot-blue';
      const tp = [];
      if (entry.gaveCount > 0) tp.push(`${entry.gaveCount} entregue${entry.gaveCount !== 1 ? 's' : ''}`);
      if (entry.gotCount  > 0) tp.push(`${entry.gotCount} recebida${entry.gotCount !== 1 ? 's' : ''}`);
      actionTxt = `🤝 Troca — ${tp.join(' · ')}`;
    }
    else if (entry.type === 'reset_owned') { dotCls = 'dot-red'; actionTxt = `🗑 Coleção resetada — ${entry.count} desmarcada${entry.count !== 1 ? 's' : ''}`; }
    else if (entry.type === 'reset_dups')  { dotCls = 'dot-red'; actionTxt = `🗑 Repetidas zeradas — ${entry.qty} removida${entry.qty !== 1 ? 's' : ''}`; }
    else { dotCls = 'dot-red'; actionTxt = `🗑 ${entry.count} repetidas zeradas`; }

    return (
      <div className={`hist-entry hist-batch${expanded ? ' is-expanded' : ''}`}>
        <div className="hist-batch-main">
          <span className={`hist-dot ${dotCls}`} />
          <div className="hist-info">
            <span className="hist-action-txt">{actionTxt}</span>
            <span className="hist-detail">{entry.teamSummary}</span>
          </div>
          <div className="hist-batch-right">
            {undoBtn}
            {undoBadge}
            {hasDetail && (
              <button className="hist-expand-btn" onClick={() => setExpanded(x => !x)}>
                {expanded ? '▴' : '▾'}
              </button>
            )}
            <span className="hist-ago">{ago}</span>
          </div>
        </div>
        {expanded && expandGroups.length > 0 && (() => {
          if (entry.type === 'trade') {
            const gaveGroups = groupByTeam(entry.gaveCodes || [], data);
            const gotGroups  = groupByTeam(entry.gotCodes  || [], data);
            const gotNewSet  = new Set(entry.gotNewCodes || []);
            const renderRow  = (g, renderChip) => (
              <div key={g.key} className="hist-expand-row">
                {TEAM_ISO[g.key]
                  ? <span className={`fi fi-${TEAM_ISO[g.key]} hist-expand-flag`} />
                  : <span className="hist-expand-flag-txt">{g.flag || g.key}</span>
                }
                <span className="hist-expand-team">{g.key}</span>
                <span className="hist-expand-chips">{g.codes.map(c => renderChip(c))}</span>
              </div>
            );
            return (
              <div className="hist-expand-body">
                {gaveGroups.length > 0 && (
                  <div className="trade-expand-section">
                    <div className="trade-expand-label">➡️ Entregou</div>
                    {gaveGroups.map(g => renderRow(g, c => (
                      <span key={c} className="pack-chip pack-chip-dup">{codeNum(c)}</span>
                    )))}
                  </div>
                )}
                {gotGroups.length > 0 && (
                  <div className="trade-expand-section">
                    <div className="trade-expand-label">⬅️ Recebeu</div>
                    {gotGroups.map(g => renderRow(g, c => gotNewSet.has(c)
                      ? <span key={c} className="pack-chip pack-chip-new">{codeNum(c)}</span>
                      : <span key={c} className="pack-chip pack-chip-dup">{codeNum(c)}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const newSet = entry.type === 'open_pack' ? new Set(entry.newCodes || []) : null;
          const qty    = entry.parsedQty || {};
          return (
            <div className="hist-expand-body">
              {expandGroups.map(g => (
                <div key={g.key} className="hist-expand-row">
                  {TEAM_ISO[g.key]
                    ? <span className={`fi fi-${TEAM_ISO[g.key]} hist-expand-flag`} />
                    : <span className="hist-expand-flag-txt">{g.flag || g.key}</span>
                  }
                  <span className="hist-expand-team">{g.key}</span>
                  {newSet ? (
                    <span className="hist-expand-chips">
                      {g.codes.map(c => {
                        const isNew = newSet.has(c);
                        const q     = qty[c] || 1;
                        const num   = codeNum(c);
                        if (isNew) {
                          const extra = q - 1;
                          return (
                            <span key={c} className="pack-chip-group">
                              <span className="pack-chip pack-chip-new">{num}</span>
                              {extra > 0 && <span className="pack-chip pack-chip-dup">{num}{extra > 1 && <sup>×{extra}</sup>}</span>}
                            </span>
                          );
                        }
                        return <span key={c} className="pack-chip pack-chip-dup">{num}{q > 1 && <sup>×{q}</sup>}</span>;
                      })}
                    </span>
                  ) : (
                    <span className="hist-expand-nums">{g.codes.map(codeNum).join(' · ')}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    );
  }

  const dotCls    = entry.type === 'mark' ? 'dot-green' : entry.type === 'unmark' ? 'dot-red' : 'dot-amber';
  const badgeCls  = entry.type === 'mark' ? 'badge-green' : entry.type === 'unmark' ? 'badge-red' : 'badge-amber';
  const actionLbl = entry.type === 'mark' ? 'Colada' : entry.type === 'unmark' ? 'Desmarcada' : `+${entry.qty} rep.`;

  return (
    <div className="hist-entry">
      <span className={`hist-dot ${dotCls}`} />
      {iso
        ? <span className={`fi fi-${iso} hist-flag`} />
        : <span className="hist-flag-placeholder">{entry.teamCode === 'FWC' ? '🏆' : '🥤'}</span>
      }
      <div className="hist-info">
        <span className="hist-code">{entry.code}</span>
        {name && <span className="hist-name">{name}</span>}
      </div>
      <span className={`hist-badge ${badgeCls}`}>{actionLbl}</span>
      {undoBadge}
      {undoBtn}
      <span className="hist-ago">{ago}</span>
    </div>
  );
});

export default HistEntry;
