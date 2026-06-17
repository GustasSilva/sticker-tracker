'use client';
import { countOwned, matchesSearch } from '@/utils/stickers';
import StickerBox from '@/components/stickers/StickerBox';

export default function SpecialCard({ title, codes, owned, duplicates, toggle, extraClass, filter, search,
  sectionCode, sectionName, cardColor, cardId, collapsed, onToggleCollapse, onLongPress }) {
  const n     = countOwned(codes, owned);
  const total = codes.length;
  const displayed = search ? codes.filter(c => matchesSearch(c, search)) : codes;

  if (displayed.length === 0) return null;
  if (!search) {
    if (filter === 'complete'   && n < total) return null;
    if (filter === 'none'       && n > 0)     return null;
    if (filter === 'incomplete' && (n === 0 || n === total)) return null;
  }

  return (
    <div id={cardId} className={`team-card ${extraClass}${collapsed ? ' is-collapsed' : ''}`}>
      <div className="team-header" onClick={onToggleCollapse} style={{ cursor: 'pointer' }}>
        <span className="team-header-caret">{collapsed ? '▸' : '▾'}</span>
        <span className="team-name">{title}</span>
        <span className="team-count">{n}/{total}<span className="team-pct">{Math.round(n/total*100)}%</span></span>
      </div>
      <div className="team-progress">
        <div className="team-progress-fill" style={{ width: `${(n / total) * 100}%` }} />
      </div>
      {!collapsed && (
        <div className="stickers special-stickers">
          {displayed.map(code => (
            <StickerBox key={code} code={code} owned={owned.has(code)} onToggle={() => toggle(code)}
              foil={true} dupQty={duplicates[code] || 0} teamColor={cardColor}
              onLongPress={() => onLongPress(code, sectionCode, sectionName)} />
          ))}
        </div>
      )}
    </div>
  );
}
