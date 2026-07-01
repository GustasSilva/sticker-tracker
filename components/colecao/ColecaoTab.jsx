'use client';
import { useMemo, useState } from 'react';
import { normalize, countOwned } from '@/utils/stickers';
import DupModal from '@/components/stickers/DupModal';
import GroupJumpBar from './GroupJumpBar';
import SpecialCard from './SpecialCard';
import TeamCard from './TeamCard';

export default function ColecaoTab({ data, owned, duplicates, toggle, setCount }) {
  const [filter,    setFilter]    = useState('all');
  const [sort,      setSort]      = useState('album');
  const [search,    setSearch]    = useState('');
  const [collapsed, setCollapsed] = useState(new Set());
  const [dupModal,  setDupModal]  = useState(null);
  const q = normalize(search.trim());

  // Ordem de exibição das seções (specials, coke e times). Reordena ao vivo
  // conforme marcadas/repetidas; empate mantém a ordem do álbum (sort estável).
  const orderedSections = useMemo(() => {
    const secs = [
      { id: 'specials', codes: data.specials },
      { id: 'coke',     codes: data.coke },
      ...data.teams.map(t => ({ id: t.code, codes: t.stickers, team: t })),
    ];
    if (sort === 'album') return secs;
    const cmp = {
      owned_desc: (a, b) => b.n - a.n,
      owned_asc:  (a, b) => a.n - b.n,
      dups_desc:  (a, b) => b.d - a.d,
      dups_asc:   (a, b) => a.d - b.d,
    }[sort];
    return secs
      .map(s => ({ ...s, n: countOwned(s.codes, owned), d: s.codes.reduce((a, c) => a + (duplicates[c] || 0), 0) }))
      .sort(cmp);
  }, [sort, data, owned, duplicates]);

  function openDupModal(code, teamCode, teamName) {
    const total = (owned.has(code) ? 1 : 0) + (duplicates[code] || 0);
    setDupModal({ code, teamCode, teamName, totalInitial: total });
  }

  async function handleDupSave(code, totalCount) {
    await setCount(code, totalCount);
    setDupModal(null);
  }

  function toggleCollapse(id) {
    setCollapsed(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allIds = ['specials', 'coke', ...data.teams.map(t => t.code)];
  const allCollapsed = allIds.every(c => collapsed.has(c));

  function toggleCollapseAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(allIds));
  }

  function jump(code) {
    if (search) setSearch('');
    if (collapsed.has(code)) {
      setCollapsed(s => { const n = new Set(s); n.delete(code); return n; });
    }
    setTimeout(() => {
      const el = document.getElementById(`tc-${code}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  return (
    <div>
      <div className="sticky-controls">
        <div className="controls-bar">
          <div className="filter-bar">
            {[['all','Todas'],['incomplete','Incompletas'],['dups','Repetidas']].map(([m, l]) => (
              <button key={m} className={filter === m ? 'active' : ''} onClick={() => setFilter(m)}>{l}</button>
            ))}
            <button className="collapse-all-btn" onClick={toggleCollapseAll}
              title={allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}>
              <span className="collapse-caret">{allCollapsed ? '▸' : '▾'}</span>
              <span className="collapse-text">{allCollapsed ? ' Expandir' : ' Recolher'}</span>
            </button>
          </div>
          <div className="search-sort-row">
            <div className="search-wrap">
              <input type="text" className="search-input"
                placeholder="🔍 Buscar por código, jogador ou seleção..."
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && (
                <button className="search-clear" onClick={() => setSearch('')} aria-label="Limpar busca">×</button>
              )}
            </div>
            <div className="sort-bar">
              <span className="sort-label">⇅<span className="sort-label-text"> Ordenar</span></span>
              <select className={`sort-select${sort !== 'album' ? ' is-active' : ''}`}
                value={sort} onChange={e => setSort(e.target.value)} title="Ordenar seções">
                <option value="album">Álbum (padrão)</option>
                <option value="owned_desc">Mais marcadas</option>
                <option value="owned_asc">Menos marcadas</option>
                <option value="dups_desc">Mais repetidas</option>
                <option value="dups_asc">Menos repetidas</option>
              </select>
            </div>
          </div>
        </div>
        <GroupJumpBar teams={data.teams} owned={owned} jump={jump} />
      </div>

      <div className="grid">
        {orderedSections.map(sec => {
          if (sec.id === 'specials') return (
            <SpecialCard key="specials" title="✦ Página Inicial / FIFA World Cup History"
              codes={data.specials} owned={owned} duplicates={duplicates} toggle={toggle}
              extraClass="intro-card" filter={filter} search={q}
              sectionCode="FWC" sectionName="Copa do Mundo 2026" cardColor="#B08030"
              cardId="tc-specials"
              collapsed={collapsed.has('specials')} onToggleCollapse={() => toggleCollapse('specials')}
              onLongPress={openDupModal} />
          );
          if (sec.id === 'coke') return (
            <SpecialCard key="coke" title="🥤 Coca-Cola Bonus Stickers"
              codes={data.coke} owned={owned} duplicates={duplicates} toggle={toggle}
              extraClass="coke-card" filter={filter} search={q}
              sectionCode="CC" sectionName="Coca-Cola Stickers" cardColor="#CC0000"
              cardId="tc-coke"
              collapsed={collapsed.has('coke')} onToggleCollapse={() => toggleCollapse('coke')}
              onLongPress={openDupModal} />
          );
          const team = sec.team;
          return (
            <TeamCard key={team.code} team={team} owned={owned} duplicates={duplicates}
              toggle={toggle} filter={filter} search={q}
              collapsed={collapsed.has(team.code)} onToggleCollapse={() => toggleCollapse(team.code)}
              onLongPress={openDupModal} />
          );
        })}
      </div>

      {dupModal && (
        <DupModal
          code={dupModal.code}
          teamCode={dupModal.teamCode}
          teamName={dupModal.teamName}
          totalInitial={dupModal.totalInitial}
          onSave={handleDupSave}
          onClose={() => setDupModal(null)}
        />
      )}
    </div>
  );
}
