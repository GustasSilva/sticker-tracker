'use client';
import { TEAM_COLORS } from '@/data/players';
import { countOwned, matchesSearch, shouldShow } from '@/utils/stickers';
import { Flag } from '@/components/ui/Flag';
import StickerBox from '@/components/stickers/StickerBox';

export default function TeamCard({ team, owned, duplicates, toggle, filter, search, collapsed, onToggleCollapse, onLongPress }) {
  const n         = countOwned(team.stickers, owned);
  const total     = team.stickers.length;
  const teamDups  = team.stickers.reduce((s, c) => s + (duplicates[c] || 0), 0);
  const teamColor = TEAM_COLORS[team.code] || '#1e3055';

  const displayed = search
    ? team.stickers.filter(c => matchesSearch(c, search, team.name, team.code))
    : team.stickers;

  if (displayed.length === 0) return null;
  if (!search && !shouldShow(filter, n, total)) return null;

  const complete = n === total;

  return (
    <div id={`tc-${team.code}`} className={`team-card${complete ? ' team-complete' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      <div className="team-header" onClick={onToggleCollapse} style={{ cursor: 'pointer' }}>
        <span className="team-header-caret">{collapsed ? '▸' : '▾'}</span>
        <span className="team-name">
          <Flag teamCode={team.code} />
          {team.group} · {team.name}
        </span>
        <span className="team-count">
          {teamDups > 0 && <span className="team-dups">{teamDups} rep.</span>}
          {n}/{total}<span className="team-pct">{Math.round(n/total*100)}%</span>
        </span>
      </div>
      <div className="team-progress">
        <div className="team-progress-fill" style={{ width: `${(n / total) * 100}%` }} />
      </div>
      {!collapsed && (
        <div className="stickers">
          {displayed.map(code => {
            const posIdx = team.stickers.indexOf(code);
            return (
              <StickerBox key={code} code={code} owned={owned.has(code)} onToggle={() => toggle(code)}
                foil={posIdx === 0} special={posIdx === 12}
                dupQty={duplicates[code] || 0} teamColor={teamColor}
                onLongPress={() => onLongPress(code, team.code, team.name)} />
            );
          })}
        </div>
      )}
    </div>
  );
}
