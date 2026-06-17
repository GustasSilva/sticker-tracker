'use client';
import { useMemo } from 'react';
import { TEAM_ISO, TEAM_FLAGS } from '@/data/players';
import { countOwned } from '@/utils/stickers';

export default function GroupJumpBar({ teams, owned, jump }) {
  const groups = useMemo(() => {
    const map = {};
    for (const t of teams) {
      if (!map[t.group]) map[t.group] = [];
      map[t.group].push(t);
    }
    return Object.keys(map).sort().map(g => ({ letter: g, teams: map[g] }));
  }, [teams]);

  return (
    <div className="jump-bar-wrap">
      <div className="jump-bar">
        {groups.map((g, gi) => (
          <span key={g.letter} className="jump-group">
            {gi > 0 && <span className="jump-divider" />}
            <span className="jump-group-label">{g.letter}</span>
            {g.teams.map(t => {
              const iso = TEAM_ISO[t.code];
              const n   = countOwned(t.stickers, owned);
              const pct = Math.round((n / t.stickers.length) * 100);
              return (
                <button key={t.code} className="jump-chip" title={`${t.name} (${n}/${t.stickers.length})`}
                  onClick={() => jump(t.code)}>
                  {iso
                    ? <span className={`fi fi-${iso} jump-chip-flag`} />
                    : <span className="jump-chip-flag">{TEAM_FLAGS[t.code] || t.code[0]}</span>
                  }
                  <span className="jump-chip-code">{t.code}</span>
                  <span className="jump-chip-bar"><span style={{ width: `${pct}%` }} /></span>
                </button>
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );
}
