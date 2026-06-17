'use client';
import { useState } from 'react';
import { normalize } from '@/utils/stickers';
import DupModal from '@/components/stickers/DupModal';
import GroupJumpBar from './GroupJumpBar';
import SpecialCard from './SpecialCard';
import TeamCard from './TeamCard';

export default function ColecaoTab({ data, owned, duplicates, toggle, setCount }) {
  const [filter,    setFilter]    = useState('all');
  const [search,    setSearch]    = useState('');
  const [collapsed, setCollapsed] = useState(new Set());
  const [dupModal,  setDupModal]  = useState(null);
  const q = normalize(search.trim());

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
    const el = document.getElementById(`tc-${code}`);
    if (!el) return;
    if (collapsed.has(code)) {
      setCollapsed(s => { const n = new Set(s); n.delete(code); return n; });
    }
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }

  return (
    <div>
      <div className="sticky-controls">
        <div className="controls-bar">
          <div className="filter-bar">
            {[['all','Todas'],['incomplete','Incompletas'],['complete','Completas']].map(([m, l]) => (
              <button key={m} className={filter === m ? 'active' : ''} onClick={() => setFilter(m)}>{l}</button>
            ))}
            <button className="collapse-all-btn" onClick={toggleCollapseAll}>
              {allCollapsed ? '▸ Expandir' : '▾ Recolher'}
            </button>
          </div>
          <input type="text" className="search-input"
            placeholder="🔍 Buscar por código, jogador ou seleção..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <GroupJumpBar teams={data.teams} owned={owned} jump={jump} />
      </div>

      <div className="grid">
        <SpecialCard title="✦ Página Inicial / FIFA World Cup History"
          codes={data.specials} owned={owned} duplicates={duplicates} toggle={toggle}
          extraClass="intro-card" filter={filter} search={q}
          sectionCode="FWC" sectionName="Copa do Mundo 2026" cardColor="#B08030"
          cardId="tc-specials"
          collapsed={collapsed.has('specials')} onToggleCollapse={() => toggleCollapse('specials')}
          onLongPress={openDupModal} />
        <SpecialCard title="🥤 Coca-Cola Bonus Stickers"
          codes={data.coke} owned={owned} duplicates={duplicates} toggle={toggle}
          extraClass="coke-card" filter={filter} search={q}
          sectionCode="CC" sectionName="Coca-Cola Stickers" cardColor="#CC0000"
          cardId="tc-coke"
          collapsed={collapsed.has('coke')} onToggleCollapse={() => toggleCollapse('coke')}
          onLongPress={openDupModal} />
        {data.teams.map(team => (
          <TeamCard key={team.code} team={team} owned={owned} duplicates={duplicates}
            toggle={toggle} filter={filter} search={q}
            collapsed={collapsed.has(team.code)} onToggleCollapse={() => toggleCollapse(team.code)}
            onLongPress={openDupModal} />
        ))}
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
