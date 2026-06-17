'use client';
import { useMemo } from 'react';
import { TEAM_ISO } from '@/data/players';
import { parseStickersText, groupByTeam, codeNum } from '@/utils/stickers';

export default function PackBreakdown({ text, allCodes, owned, duplicates, data }) {
  const content = useMemo(() => {
    if (!text.trim()) return null;
    const parsed = parseStickersText(text);
    const valid  = Object.keys(parsed).filter(c => allCodes.has(c));
    if (!valid.length) return null;
    const newUnique = valid.filter(c => !owned.has(c));
    const dupCodes  = valid.filter(c =>  owned.has(c));
    const newCount  = newUnique.length;
    const totalDups = dupCodes.reduce((s, c) => s + (parsed[c] || 1), 0)
                    + newUnique.reduce((s, c) => s + Math.max(0, (parsed[c] || 1) - 1), 0);
    return { parsed, groups: groupByTeam(valid, data), newCount, totalDups };
  }, [text, allCodes, owned, data]);

  if (!content) return null;
  const { parsed, groups, newCount, totalDups } = content;
  const pl = n => n !== 1;

  return (
    <div className="pack-breakdown">
      <div className="pack-summary">
        <span className="pack-sum-new">✦ {newCount} nova{pl(newCount) ? 's' : ''}</span>
        <span className="pack-sum-sep"> · </span>
        <span className="pack-sum-dup">★ {totalDups} repetida{pl(totalDups) ? 's' : ''}</span>
      </div>
      <div className="pack-groups">
        {groups.map(g => (
          <div key={g.key} className="pack-group">
            <span className="pack-group-hd">
              {TEAM_ISO[g.key]
                ? <span className={`fi fi-${TEAM_ISO[g.key]} pack-flag`} />
                : <span className="pack-flag-txt">{g.flag}</span>
              }
              <span className="pack-team-code">{g.key}</span>
            </span>
            <span className="pack-chips">
              {g.codes.map(c => {
                const isOwned = owned.has(c);
                const qty     = parsed[c] || 1;
                const num     = codeNum(c);
                if (!isOwned) {
                  const extra = qty - 1;
                  return (
                    <span key={c} className="pack-chip-group">
                      <span className="pack-chip pack-chip-new">{num}</span>
                      {extra > 0 && (
                        <span className="pack-chip pack-chip-dup">
                          {num}{extra > 1 && <sup>×{extra}</sup>}
                        </span>
                      )}
                    </span>
                  );
                }
                return (
                  <span key={c} className="pack-chip pack-chip-dup">
                    {num}{qty > 1 && <sup>×{qty}</sup>}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
