'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PLAYER_NAMES, TEAM_FLAGS, TEAM_ISO, TEAM_COLORS } from '@/data/players';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMBINING_RE = new RegExp('[\\u0300-\\u036f]', 'g');
const normalize = s => s.normalize('NFD').replace(COMBINING_RE, '').toLowerCase();

function matchesSearch(code, q, teamName = '', teamCode = '') {
  if (!q) return true;
  const nq = normalize(q).replace(/\s+/g, '');
  if (normalize(code).replace(/\s+/g, '').includes(nq)) return true;
  if (normalize(PLAYER_NAMES[code] || '').includes(normalize(q))) return true;
  if (teamName && normalize(teamName).includes(normalize(q))) return true;
  if (teamCode && normalize(teamCode).includes(nq)) return true;
  return false;
}

function parseStickersText(text) {
  const result = {};
  const cleaned = text.replace(/[^\w\s:,.;·()\-]/g, ' ');
  const upper = cleaned.toUpperCase().replace(/[·;]/g, ' ').replace(/,/g, ' ');
  const tokens = upper.split(/\s+/).filter(Boolean);
  let lastPrefix = null;

  for (const token of tokens) {
    if (/^[A-Z]{2,4}:?$/.test(token)) { lastPrefix = token.replace(':', ''); continue; }
    const combined = token.match(/^([A-Z]{2,4})(\d+)(?:\((\d+)X?\))?$/);
    if (combined) {
      const code = combined[1] + parseInt(combined[2]);
      result[code] = (result[code] || 0) + (combined[3] ? parseInt(combined[3]) : 1);
      lastPrefix = combined[1];
      continue;
    }
    const numOnly = token.match(/^(\d+)(?:\((\d+)X?\))?$/);
    if (numOnly && lastPrefix) {
      const rawNum = numOnly[1];
      const code = rawNum === '00' ? '00' : lastPrefix + parseInt(rawNum);
      result[code] = (result[code] || 0) + (numOnly[2] ? parseInt(numOnly[2]) : 1);
      continue;
    }
    if (!/^\d/.test(token)) lastPrefix = null;
  }
  return result;
}

function groupByTeam(codeList, data) {
  const codeSet = new Set(Array.isArray(codeList) ? codeList : Object.keys(codeList));
  const groups = [];
  const fwc = data.specials.filter(c => codeSet.has(c));
  if (fwc.length) groups.push({ key: 'FWC', label: 'Copa do Mundo 2026', flag: '🏆', codes: fwc });
  const cc = data.coke.filter(c => codeSet.has(c));
  if (cc.length) groups.push({ key: 'CC', label: 'Coca-Cola Stickers', flag: '🥤', codes: cc });
  for (const team of data.teams) {
    const tc = team.stickers.filter(c => codeSet.has(c));
    if (tc.length) groups.push({ key: team.code, label: team.name, flag: TEAM_FLAGS[team.code] || '', codes: tc });
  }
  return groups;
}

function codeNum(code) {
  const m = code.match(/^([A-Z]*)(\d+)$/);
  return m ? m[2] : code;
}

function formatGroupLine(g) {
  return `${g.flag}${g.key}: ${g.codes.map(codeNum).join(' · ')}`;
}

function generateDupText(duplicates, data) {
  const lines = ['Tenho essas figurinhas REPETIDAS da Copa 2026 disponíveis pra troca!', ''];
  for (const g of groupByTeam(duplicates, data)) lines.push(formatGroupLine(g));
  return lines.join('\n').trim();
}

function generateMissingText(missingCodes, data) {
  const lines = ['Preciso dessas figurinhas da Copa 2026!', ''];
  for (const g of groupByTeam(missingCodes, data)) lines.push(formatGroupLine(g));
  return lines.join('\n').trim();
}

function countOwned(codes, owned) { return codes.filter(c => owned.has(c)).length; }

function getTeamInfo(code, data) {
  if (code === '00') return { teamCode: 'FWC', teamName: 'Copa do Mundo 2026' };
  const m = code.match(/^([A-Z]+)\d+$/);
  if (!m) return { teamCode: '', teamName: code };
  const prefix = m[1];
  if (prefix === 'FWC') return { teamCode: 'FWC', teamName: 'Copa do Mundo 2026' };
  if (prefix === 'CC')  return { teamCode: 'CC',  teamName: 'Coca-Cola Stickers' };
  const team = data.teams.find(t => t.code === prefix);
  return team ? { teamCode: team.code, teamName: team.name } : { teamCode: prefix, teamName: prefix };
}

function formatAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'agora';
  if (m < 60) return `há ${m}min`;
  if (h < 24) return `há ${h}h`;
  if (d === 1) return 'ontem';
  return `há ${d}d`;
}

function buildHistEntry(row, data) {
  return {
    id: row.sticker_code + '_' + row.updated_at,
    ts: new Date(row.updated_at),
    type: !row.owned ? 'unmark' : (row.duplicates > 0 ? 'dup' : 'mark'),
    code: row.sticker_code,
    ...getTeamInfo(row.sticker_code, data),
    qty: row.duplicates || 0,
  };
}

function teamSummary(codes, data) {
  const counts = {};
  codes.forEach(code => {
    const { teamCode } = getTeamInfo(code, data);
    if (teamCode) counts[teamCode] = (counts[teamCode] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const extra = Object.keys(counts).length - top.length;
  return top.map(([tc, n]) => `${tc}(${n})`).join(', ') + (extra > 0 ? `… +${extra}` : '');
}

function shouldShow(filter, n, total) {
  if (filter === 'incomplete') return n > 0 && n < total;
  if (filter === 'complete') return n === total;
  if (filter === 'none') return n === 0;
  return true;
}

// ─── Small components ─────────────────────────────────────────────────────────

function Flag({ teamCode }) {
  const iso = TEAM_ISO[teamCode];
  if (!iso) return null;
  return <span className={`fi fi-${iso}`} />;
}

function GroupFlag({ groupKey, fallback }) {
  return TEAM_ISO[groupKey]
    ? <Flag teamCode={groupKey} />
    : fallback ? <span>{fallback}</span> : null;
}

// ─── Dup Modal (look: images 12-13) ──────────────────────────────────────────

function DupModal({ code, teamCode, teamName, totalInitial, onSave, onClose }) {
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

        {/* header: flag + code + team name */}
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

        {/* counter */}
        <div className="dup-modal-controls">
          <button className="dup-modal-btn" onClick={() => setTotal(t => Math.max(0, t - 1))}>−</button>
          <span className="dup-modal-qty">{total}</span>
          <button className="dup-modal-btn" onClick={() => setTotal(t => t + 1)}>+</button>
        </div>

        {/* status text + dots */}
        <div className={`dup-modal-status ${isOwned ? (extras > 0 ? 'has-rep' : 'is-owned') : 'not-owned'}`}>
          {statusText}
        </div>
        <div className="dup-modal-dots">
          {isOwned && <span className="dup-dot green" />}
          {Array.from({ length: Math.min(extras, 6) }, (_, i) => <span key={i} className="dup-dot amber" />)}
          {extras > 6 && <span className="dup-dot-more">+{extras - 6}</span>}
        </div>

        {/* trade badge */}
        {extras > 0 && (
          <div className="dup-trade-badge">
            {extras} cópia{extras > 1 ? 's' : ''} disponível{extras > 1 ? 'is' : ''} para troca
          </div>
        )}

        {/* actions */}
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

// ─── Main Tracker ─────────────────────────────────────────────────────────────

export default function Tracker({ data, userEmail }) {
  const supabase = useMemo(() => createClient(), []);
  const [owned,        setOwned]        = useState(new Set());
  const [duplicates,   setDuplicates]   = useState({});
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState('colecao');
  const [history,      setHistory]      = useState([]);
  const [historyOpen,  setHistoryOpen]  = useState(false);

  function pushHist(entry) {
    setHistory(h => [{ ...entry, id: entry.id ?? (Date.now() + Math.random()), ts: entry.ts ?? new Date() }, ...h.slice(0, 199)]);
  }

  const allCodes = useMemo(() => {
    const s = new Set();
    data.specials.forEach(c => s.add(c));
    data.coke.forEach(c => s.add(c));
    data.teams.forEach(t => t.stickers.forEach(c => s.add(c)));
    return s;
  }, [data]);

  const missingCodes = useMemo(
    () => [...data.specials, ...data.coke, ...data.teams.flatMap(t => t.stickers)].filter(c => !owned.has(c)),
    [owned, data]
  );

  const totalAll = useMemo(
    () => data.teams.reduce((a, t) => a + t.stickers.length, 0) + data.specials.length + data.coke.length,
    [data]
  );

  useEffect(() => {
    let active = true;
    async function load() {
      const [mainRes, histRes] = await Promise.all([
        supabase.from('user_progress').select('sticker_code, owned, duplicates').or('owned.eq.true,duplicates.gt.0'),
        supabase.from('user_progress').select('sticker_code, owned, duplicates, updated_at').order('updated_at', { ascending: false }).limit(60),
      ]);

      let rows;
      if (mainRes.error) {
        const { data: fallback } = await supabase.from('user_progress').select('sticker_code, owned').eq('owned', true);
        rows = fallback;
      } else {
        rows = mainRes.data;
      }

      if (!active) return;

      if (rows) {
        const ownedSet = new Set();
        const dupMap   = {};
        for (const r of rows) {
          if (r.owned)          ownedSet.add(r.sticker_code);
          if (r.duplicates > 0) dupMap[r.sticker_code] = r.duplicates;
        }
        setOwned(ownedSet);
        setDuplicates(dupMap);
      }

      if (histRes.data) {
        setHistory(histRes.data.map(row => buildHistEntry(row, data)));
      }

      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [supabase, data]);

  const getUserId = useCallback(async () => {
    const { data: d } = await supabase.auth.getUser();
    return d?.user?.id;
  }, [supabase]);

  async function toggle(code) {
    const next = new Set(owned);
    const was  = next.has(code);
    if (was) next.delete(code); else next.add(code);
    setOwned(next);
    pushHist({ type: was ? 'unmark' : 'mark', code, ...getTeamInfo(code, data) });
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('user_progress').upsert(
      { user_id: userId, sticker_code: code, owned: !was, duplicates: duplicates[code] ?? 0, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,sticker_code' }
    );
  }

  // Unified count setter: totalCount = 0 (none) | 1 (owned) | 2+ (owned + duplicates)
  async function setCount(code, totalCount) {
    const isOwned = totalCount >= 1;
    const dups    = Math.max(0, totalCount - 1);
    const newOwned = new Set(owned);
    if (isOwned) newOwned.add(code); else newOwned.delete(code);
    const newDups = { ...duplicates };
    if (dups <= 0) delete newDups[code]; else newDups[code] = dups;
    setOwned(newOwned);
    setDuplicates(newDups);
    const histType = totalCount === 0 ? 'unmark' : totalCount === 1 ? 'mark' : 'dup';
    pushHist({ type: histType, code, ...getTeamInfo(code, data), qty: dups });
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('user_progress').upsert(
      { user_id: userId, sticker_code: code, owned: isOwned, duplicates: dups, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,sticker_code' }
    );
  }

  // qty > 0 auto-marks as owned
  async function saveDuplicates(updates) {
    const userId   = await getUserId();
    if (!userId) return;
    const newDups  = { ...duplicates };
    const newOwned = new Set(owned);
    for (const [code, qty] of Object.entries(updates)) {
      if (qty <= 0) { delete newDups[code]; } else { newDups[code] = qty; newOwned.add(code); }
    }
    setDuplicates(newDups);
    setOwned(newOwned);
    // push history
    const entries = Object.entries(updates);
    if (entries.length === 1) {
      const [code, qty] = entries[0];
      pushHist({ type: 'dup', code, ...getTeamInfo(code, data), qty });
    } else if (entries.length > 1) {
      const codes = entries.map(([c]) => c);
      pushHist({ id: 'bdp_' + Date.now(), type: 'batch_dup', count: entries.length, teamSummary: teamSummary(codes, data), codes });
    }
    await supabase.from('user_progress').upsert(
      entries.map(([code, qty]) => ({
        user_id: userId, sticker_code: code,
        owned: newOwned.has(code), duplicates: Math.max(0, qty), updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,sticker_code' }
    );
  }

  async function importOwned(codes) {
    const toAdd = codes.filter(c => allCodes.has(c) && !owned.has(c));
    if (!toAdd.length) return 0;
    const newOwned = new Set(owned);
    toAdd.forEach(c => newOwned.add(c));
    setOwned(newOwned);
    if (toAdd.length === 1) {
      pushHist({ type: 'mark', code: toAdd[0], ...getTeamInfo(toAdd[0], data) });
    } else {
      pushHist({ id: 'bm_' + Date.now(), type: 'batch_mark', count: toAdd.length, teamSummary: teamSummary(toAdd, data), codes: toAdd });
    }
    const userId = await getUserId();
    if (!userId) return toAdd.length;
    await supabase.from('user_progress').upsert(
      toAdd.map(c => ({
        user_id: userId, sticker_code: c, owned: true,
        duplicates: duplicates[c] ?? 0, updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,sticker_code' }
    );
    return toAdd.length;
  }

  async function clearDuplicates() {
    const codes = Object.keys(duplicates);
    if (!codes.length) return;
    const userId = await getUserId();
    if (!userId) return;
    setDuplicates({});
    await supabase.from('user_progress').upsert(
      codes.map(c => ({ user_id: userId, sticker_code: c, owned: owned.has(c), duplicates: 0, updated_at: new Date().toISOString() })),
      { onConflict: 'user_id,sticker_code' }
    );
  }

  if (loading) return <div className="loading">Carregando coleção...</div>;

  const pct = Math.round((owned.size / totalAll) * 100);
  const totalDups = Object.values(duplicates).reduce((s, q) => s + q, 0);

  return (
    <div>
      <div className="app-header-wrap">
        <div className="app-title-area">
          <h1>⚽ Panini FIFA World Cup 2026</h1>
          <div id="summary">
            <span className="sum-count"><strong>{owned.size}</strong>/{totalAll}</span>
            {' '}figurinhas
            <span className="sum-sep">·</span>
            <span className="sum-pct">{pct}%</span>
            {totalDups > 0 && <>
              <span className="sum-sep">·</span>
              <span className="sum-dups">{totalDups} rep.</span>
            </>}
          </div>
        </div>
        <div className="app-user-corner">
          <span className="user-email-small">{userEmail}</span>
          <form action="/logout" method="post">
            <button type="submit" className="link-btn">Sair</button>
          </form>
        </div>
      </div>
      <div id="total-bar-wrap">
        <div id="total-bar" style={{ width: `${pct}%` }} />
      </div>

      <nav className="tab-nav">
        {[['colecao','📖 Coleção'],['trocas','🔄 Trocas'],['comparar','🔍 Comparar'],['config','⚙️']].map(([id, label]) => (
          <button key={id} className={`tab-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === 'colecao'  && <ColecaoTab data={data} owned={owned} duplicates={duplicates} toggle={toggle} setCount={setCount} />}
      {tab === 'trocas'   && <TrocasTab  data={data} owned={owned} duplicates={duplicates} missingCodes={missingCodes} allCodes={allCodes} saveDuplicates={saveDuplicates} clearDuplicates={clearDuplicates} />}
      {tab === 'comparar' && <CompararTab data={data} owned={owned} duplicates={duplicates} allCodes={allCodes} />}
      {tab === 'config'   && <ConfigTab   allCodes={allCodes} owned={owned} duplicates={duplicates} importOwned={importOwned} saveDuplicates={saveDuplicates} />}

      {/* floating history button */}
      <button className="history-fab" onClick={() => setHistoryOpen(true)} title="Histórico de alterações">
        🕐
      </button>

      {historyOpen && <HistoryDrawer history={history} data={data} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

// ─── Coleção ──────────────────────────────────────────────────────────────────

function ColecaoTab({ data, owned, duplicates, toggle, setCount }) {
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
      <div className="controls-bar">
        <div className="controls-top-row">
          <div className="filter-bar">
            {[['all','Todas'],['incomplete','Incompletas'],['complete','Completas'],['none','Vazias']].map(([m, l]) => (
              <button key={m} className={filter === m ? 'active' : ''} onClick={() => setFilter(m)}>{l}</button>
            ))}
          </div>
          <button className="collapse-all-btn" onClick={toggleCollapseAll}>
            {allCollapsed ? '▸ Expandir tudo' : '▾ Recolher tudo'}
          </button>
        </div>
        <input type="text" className="search-input"
          placeholder="🔍 Buscar por código, jogador ou seleção..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <GroupJumpBar teams={data.teams} owned={owned} jump={jump} />

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

function SpecialCard({ title, codes, owned, duplicates, toggle, extraClass, filter, search,
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
              dupQty={duplicates[code] || 0} teamColor={cardColor}
              onLongPress={() => onLongPress(code, sectionCode, sectionName)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCard({ team, owned, duplicates, toggle, filter, search, collapsed, onToggleCollapse, onLongPress }) {
  const n         = countOwned(team.stickers, owned);
  const total     = team.stickers.length;
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
        <span className="team-count">{n}/{total}<span className="team-pct">{Math.round(n/total*100)}%</span></span>
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

// ─── Group Jump Bar ───────────────────────────────────────────────────────────

function GroupJumpBar({ teams, owned, jump }) {
  // Group teams by FIFA group letter
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

function StickerBox({ code, owned, onToggle, foil, special, dupQty, teamColor, onLongPress }) {
  const timerRef  = useRef(null);
  const longFired = useRef(false);
  const startPos  = useRef({ x: 0, y: 0 });

  function handlePointerDown(e) {
    startPos.current = { x: e.clientX, y: e.clientY };
    longFired.current = false;
    timerRef.current = setTimeout(() => {
      longFired.current = true;
      onLongPress?.();
    }, 600);
  }

  function handlePointerUp(e) {
    clearTimeout(timerRef.current);
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (!longFired.current && dx < 10 && dy < 10) onToggle();
    longFired.current = false;
  }

  function cancel() { clearTimeout(timerRef.current); longFired.current = false; }

  const name   = PLAYER_NAMES[code];
  const m      = code.match(/^([A-Z]*)(\d+)$/);
  const prefix = m ? m[1] : '';
  const num    = m ? m[2] : code;
  const tip    = [code, name && `· ${name}`, dupQty > 0 && `(${dupQty}x rep.)`].filter(Boolean).join(' ');

  return (
    <div
      className={`sticker-label${foil ? ' foil-sticker' : ''}${special ? ' special-sticker' : ''}${owned ? ' is-checked' : ''}`}
      title={tip}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      style={{ '--tc': teamColor || '#1e3055' }}
    >
      <div className="sticker-box">
        {/* centered: team prefix above number */}
        <div className="sticker-center">
          {prefix && <span className="sticker-prefix">{prefix}</span>}
          <span className="sticker-num-big">{num}</span>
        </div>
        {dupQty > 0 && <span className="dup-corner">{dupQty}x</span>}
        {name && <span className="sticker-name">{name}</span>}
      </div>
    </div>
  );
}

// ─── Trocas ───────────────────────────────────────────────────────────────────

function TrocasTab({ data, owned, duplicates, missingCodes, allCodes, saveDuplicates, clearDuplicates }) {
  const [input,    setInput]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied,   setCopied]   = useState('');

  const dupCodes = Object.keys(duplicates);
  const dupTotal = Object.values(duplicates).reduce((s, q) => s + q, 0);

  async function markDuplicates() {
    if (!input.trim()) return;
    setSaving(true); setFeedback('');
    const parsed = parseStickersText(input);
    const valid  = {};
    for (const [code, qty] of Object.entries(parsed)) {
      if (allCodes.has(code)) valid[code] = qty;
    }
    const count = Object.keys(valid).length;
    if (!count) { setFeedback('Nenhum código válido. Use: MEX 5, BRA: 13, CAN 3(2x)'); setSaving(false); return; }
    await saveDuplicates(valid);
    setInput(''); setFeedback(`✓ ${count} figurinha(s) marcada(s).`);
    setSaving(false);
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  const dupGroups = groupByTeam(duplicates, data);
  const misGroups = groupByTeam(missingCodes, data);

  return (
    <div className="trocas-wrap">
      <section className="trocas-section">
        <h3>➕ Adicionar repetidas</h3>
        <p className="trocas-hint">Formatos aceitos: <code>MEX 5(2x)</code> ou <code>BRA: 13, 14</code></p>
        <p className="trocas-hint">Figurinhas com repetidas são marcadas como coladas automaticamente.</p>
        <textarea className="trocas-textarea" value={input} onChange={e => { setInput(e.target.value); setFeedback(''); }}
          placeholder="Pan: 9(2x), Bra: 13(1x), MEX 5, IRN 7 7..." rows={4} />
        <ImportPreview text={input} allCodes={allCodes} owned={owned} duplicates={duplicates} type="dup" />
        {feedback && <p className="trocas-feedback">{feedback}</p>}
        <button className="trocas-primary-btn" onClick={markDuplicates} disabled={saving || !input.trim()}>
          {saving ? 'Salvando...' : '📌 Marcar como repetidas'}
        </button>
      </section>

      <section className="trocas-section">
        <div className="trocas-section-header">
          <h3>🔄 Minhas repetidas</h3>
          <div className="trocas-header-right">
            <span className="trocas-badge">{dupCodes.length} fig. / {dupTotal} cópias</span>
            {dupCodes.length > 0 && <button className="trocas-danger-btn" onClick={clearDuplicates}>Zerar</button>}
          </div>
        </div>
        {!dupCodes.length ? (
          <p className="trocas-empty">Nenhuma repetida cadastrada.</p>
        ) : (
          <>
            <div className="trocas-codes-display">
              {dupGroups.map(g => (
                <div key={g.key} className="trocas-group">
                  <span className="trocas-group-label">
                    <GroupFlag groupKey={g.key} fallback={g.flag} /> {g.label}:
                  </span>
                  <span className="trocas-group-codes">
                    {g.codes.map(c => {
                      const q = duplicates[c];
                      return <span key={c} className="trocas-code">{codeNum(c)}{q > 1 ? <sup>{q}x</sup> : ''}</span>;
                    })}
                  </span>
                </div>
              ))}
            </div>
            <button className="trocas-copy-btn" onClick={() => copy(generateDupText(duplicates, data), 'dup')}>
              {copied === 'dup' ? '✓ Copiado!' : '📋 Copiar lista formatada'}
            </button>
          </>
        )}
      </section>

      <section className="trocas-section">
        <div className="trocas-section-header">
          <h3>❓ Minhas faltantes</h3>
          <span className="trocas-badge">{missingCodes.length} fig.</span>
        </div>
        {!missingCodes.length ? (
          <p className="trocas-empty">🎉 Álbum completo!</p>
        ) : (
          <>
            <div className="trocas-codes-display">
              {misGroups.map(g => (
                <div key={g.key} className="trocas-group">
                  <span className="trocas-group-label">
                    <GroupFlag groupKey={g.key} fallback={g.flag} /> {g.label}:
                  </span>
                  <span className="trocas-group-codes">
                    {g.codes.map(c => <span key={c} className="trocas-code">{codeNum(c)}</span>)}
                  </span>
                </div>
              ))}
            </div>
            <button className="trocas-copy-btn" onClick={() => copy(generateMissingText(missingCodes, data), 'mis')}>
              {copied === 'mis' ? '✓ Copiado!' : '📋 Copiar lista de faltantes'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

// ─── Comparar (bilateral) ─────────────────────────────────────────────────────

function CompararTab({ data, owned, duplicates, allCodes }) {
  const [theirDups, setTheirDups] = useState('');
  const [theirMis,  setTheirMis]  = useState('');
  const [result,    setResult]    = useState(null);
  const [copied,    setCopied]    = useState(false);

  function compare() {
    const dupCodes = Object.keys(parseStickersText(theirDups)).filter(c => allCodes.has(c));
    const hasMis   = theirMis.trim().length > 0;
    const misCodes = hasMis ? new Set(Object.keys(parseStickersText(theirMis)).filter(c => allCodes.has(c))) : null;

    const iGet    = dupCodes.filter(c => !owned.has(c));
    const myDups  = Object.keys(duplicates);
    const theyGet = misCodes ? myDups.filter(c => misCodes.has(c)) : myDups;

    setResult({ iGet, theyGet, bilateral: hasMis });
    setCopied(false);
  }

  function copyMatch() {
    if (!result) return;
    const lines = ['🤝 Match de troca — Copa 2026:'];
    lines.push('');
    if (result.iGet.length) {
      lines.push(`✅ Você pega (${result.iGet.length}):`);
      lines.push(...groupByTeam(result.iGet, data).map(formatGroupLine));
    } else {
      lines.push('✅ Você já tem tudo do parceiro.');
    }
    if (result.bilateral) {
      lines.push('');
      if (result.theyGet.length) {
        lines.push(`🔄 Você oferece (${result.theyGet.length}):`);
        lines.push(...groupByTeam(result.theyGet, data).map(formatGroupLine));
      } else {
        lines.push('🔄 Você não tem repetidas que o parceiro precisa.');
      }
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const iGetGroups    = result ? groupByTeam(result.iGet,    data) : [];
  const theyGetGroups = result ? groupByTeam(result.theyGet, data) : [];
  const dupCount = Object.keys(duplicates).length;

  return (
    <div className="trocas-wrap">
      <div className="comparar-status">
        Você tem <strong>{owned.size}</strong> figurinhas coladas e <strong>{dupCount}</strong> repetidas cadastradas.
      </div>

      <section className="trocas-section">
        <h3>📋 Repetidas do parceiro</h3>
        <p className="trocas-hint">O que <strong>ele tem pra dar</strong> — você verá o que pode pegar.</p>
        <p className="trocas-hint"><em>Formato:</em> BRA: 3 · 4, MEX 5(2x), FWC 1</p>
        <textarea className="trocas-textarea" value={theirDups}
          onChange={e => { setTheirDups(e.target.value); setResult(null); }}
          rows={4} placeholder="BRA: 3 · 4, MEX 5(2x), FWC 1..." />
      </section>

      <section className="trocas-section">
        <h3>❓ Faltantes do parceiro <span className="opt-badge">opcional</span></h3>
        <p className="trocas-hint">O que <strong>ele precisa</strong> — você verá o que pode oferecer das suas repetidas.</p>
        <textarea className="trocas-textarea" value={theirMis}
          onChange={e => { setTheirMis(e.target.value); setResult(null); }}
          rows={4} placeholder="BRA: 5 · 6 · 7, GER 2, ARG 14..." />
      </section>

      <button className="trocas-primary-btn" onClick={compare} disabled={!theirDups.trim()}>
        🤝 Calcular match
      </button>

      {result && (
        <section className="trocas-section">
          <div className="trocas-section-header">
            <h3>Resultado da troca</h3>
            <button className="trocas-copy-btn" onClick={copyMatch}>
              {copied ? '✓ Copiado!' : '📋 Copiar mensagem'}
            </button>
          </div>

          <div className="match-block">
            <div className="match-block-header match-take">
              <span>✅ Você pega</span>
              <span className="match-count">{result.iGet.length}</span>
            </div>
            {result.iGet.length > 0
              ? <div className="trocas-codes-display">
                  {iGetGroups.map(g => (
                    <div key={g.key} className="trocas-group">
                      <span className="trocas-group-label"><GroupFlag groupKey={g.key} fallback={g.flag} /> {g.label}:</span>
                      <span className="trocas-group-codes">
                        {g.codes.map(c => <span key={c} className="trocas-code">{codeNum(c)}</span>)}
                      </span>
                    </div>
                  ))}
                </div>
              : <p className="trocas-empty">Você já tem todas as disponíveis do parceiro.</p>
            }
          </div>

          {result.bilateral
            ? <div className="match-block">
                <div className="match-block-header match-give">
                  <span>🔄 Você oferece</span>
                  <span className="match-count">{result.theyGet.length}</span>
                </div>
                {result.theyGet.length > 0
                  ? <div className="trocas-codes-display">
                      {theyGetGroups.map(g => (
                        <div key={g.key} className="trocas-group">
                          <span className="trocas-group-label"><GroupFlag groupKey={g.key} fallback={g.flag} /> {g.label}:</span>
                          <span className="trocas-group-codes">
                            {g.codes.map(c => <span key={c} className="trocas-code">{codeNum(c)}</span>)}
                          </span>
                        </div>
                      ))}
                    </div>
                  : <p className="trocas-empty">Você não tem repetidas que o parceiro precisa.</p>
                }
              </div>
            : <div className="match-hint-box">
                💡 Cole as <strong>faltantes do parceiro</strong> acima para ver o que você pode oferecer.
              </div>
          }
        </section>
      )}
    </div>
  );
}

// ─── Config ───────────────────────────────────────────────────────────────────

function ImportPreview({ text, allCodes, owned, duplicates, type }) {
  return useMemo(() => {
    if (!text.trim()) return null;
    const parsed  = parseStickersText(text);
    const keys    = Object.keys(parsed);
    const valid   = keys.filter(c => allCodes.has(c));
    const invalid = keys.length - valid.length;

    let msg;
    if (type === 'owned') {
      const newOnes = valid.filter(c => !owned.has(c)).length;
      msg = newOnes > 0
        ? `${newOnes} nova${newOnes > 1 ? 's' : ''} para marcar de ${valid.length} identificadas`
        : `Todas as ${valid.length} já estão coladas`;
    } else if (type === 'dup') {
      const totalCopies = valid.reduce((s, c) => s + (parsed[c] || 1), 0);
      const updating    = duplicates ? valid.filter(c => (duplicates[c] || 0) > 0).length : 0;
      const pl = n => n !== 1;
      msg = `${valid.length} figurinha${pl(valid.length) ? 's' : ''} · ${totalCopies} repetida${pl(totalCopies) ? 's' : ''} no total`;
      if (updating > 0) msg += ` · ${updating} já cadastrada${pl(updating) ? 's' : ''} (serão atualizadas)`;
    } else {
      const misSet  = new Set(valid);
      const toMark  = [...allCodes].filter(c => !misSet.has(c) && !owned.has(c)).length;
      msg = `${toMark} figurinha${toMark > 1 ? 's' : ''} novas a marcar (excluindo ${valid.length} faltantes)`;
    }

    return (
      <p className="import-preview">
        📋 {msg}{invalid > 0 ? ` · ${invalid} entrada${invalid > 1 ? 's' : ''} inválida${invalid > 1 ? 's' : ''} ignorada${invalid > 1 ? 's' : ''}` : ''}
      </p>
    );
  }, [text, allCodes, owned, duplicates, type]);
}

function ConfigTab({ allCodes, owned, duplicates, importOwned, saveDuplicates }) {
  const [ownedInput, setOwnedInput] = useState('');
  const [dupInput,   setDupInput]   = useState('');
  const [misInput,   setMisInput]   = useState('');
  const [busy, setBusy]  = useState('');
  const [msgs, setMsgs]  = useState({});

  function setMsg(k, v) { setMsgs(m => ({ ...m, [k]: v })); }

  async function handleImportOwned() {
    setBusy('owned');
    const parsed = parseStickersText(ownedInput);
    const codes  = Object.keys(parsed).filter(c => allCodes.has(c));
    const count  = await importOwned(codes);
    setMsg('owned', count > 0 ? `✓ ${count} figurinha(s) nova(s) marcada(s).` : 'Nenhuma figurinha nova encontrada.');
    if (count > 0) setOwnedInput('');
    setBusy('');
  }

  async function handleImportDup() {
    setBusy('dup');
    const parsed = parseStickersText(dupInput);
    const valid  = {};
    for (const [code, qty] of Object.entries(parsed)) {
      if (allCodes.has(code)) valid[code] = qty;
    }
    const count = Object.keys(valid).length;
    if (count) {
      await saveDuplicates(valid);
      setMsg('dup', `✓ ${count} figurinha(s) importadas (e marcadas como coladas).`);
      setDupInput('');
    } else {
      setMsg('dup', 'Nenhum código válido encontrado.');
    }
    setBusy('');
  }

  async function handleImportMissing() {
    setBusy('mis');
    const parsed     = parseStickersText(misInput);
    const missingSet = new Set(Object.keys(parsed).filter(c => allCodes.has(c)));
    const toOwn      = [...allCodes].filter(c => !missingSet.has(c));
    const count      = await importOwned(toOwn);
    setMsg('mis', count > 0
      ? `✓ ${count} figurinha(s) marcada(s) como coladas (exceto as ${missingSet.size} faltantes).`
      : 'Nenhuma figurinha nova para marcar.');
    if (count > 0) setMisInput('');
    setBusy('');
  }

  return (
    <div className="trocas-wrap">
      <section className="trocas-section">
        <h3>✅ Importar coladas</h3>
        <p className="trocas-hint">Cole a lista de figurinhas que você tem. Apenas as novas serão marcadas.</p>
        <p className="trocas-hint"><em>Formato:</em> <code>BRA: 1 · 2 · 3</code> ou <code>MEX 5 BRA3 FWC 1</code></p>
        <textarea className="trocas-textarea" value={ownedInput}
          onChange={e => { setOwnedInput(e.target.value); setMsg('owned', ''); }}
          rows={4} placeholder="BRA: 1 · 2 · 3, MEX 5, FWC 1..." />
        <ImportPreview text={ownedInput} allCodes={allCodes} owned={owned} type="owned" />
        {msgs.owned && <p className="trocas-feedback">{msgs.owned}</p>}
        <button className="trocas-primary-btn" onClick={handleImportOwned}
          disabled={busy === 'owned' || !ownedInput.trim()}>
          {busy === 'owned' ? 'Importando...' : '✅ Marcar como coladas'}
        </button>
      </section>

      <section className="trocas-section">
        <h3>🔄 Importar repetidas</h3>
        <p className="trocas-hint">Figurinhas com repetidas são automaticamente marcadas como coladas.</p>
        <p className="trocas-hint"><em>Formato:</em> <code>BRA 3(2x)</code> ou <code>MEX: 5 6(3x)</code> · Repetir o número também funciona: <code>IRN 7 7 14</code></p>
        <textarea className="trocas-textarea" value={dupInput}
          onChange={e => { setDupInput(e.target.value); setMsg('dup', ''); }}
          rows={4} placeholder="BRA 3(2x), MEX: 5 6(3x), IRN 7 7 14..." />
        <ImportPreview text={dupInput} allCodes={allCodes} owned={owned} duplicates={duplicates} type="dup" />
        {msgs.dup && <p className="trocas-feedback">{msgs.dup}</p>}
        <button className="trocas-primary-btn" onClick={handleImportDup}
          disabled={busy === 'dup' || !dupInput.trim()}>
          {busy === 'dup' ? 'Importando...' : '📌 Importar repetidas'}
        </button>
      </section>

      <section className="trocas-section">
        <h3>❓ Importar faltantes</h3>
        <p className="trocas-hint">Cole o que você <strong>NÃO tem</strong>. Tudo fora da lista é marcado como colado.</p>
        <p className="trocas-hint">⚠️ Não desmarca figurinhas já coladas. Apenas adiciona novas.</p>
        <textarea className="trocas-textarea" value={misInput}
          onChange={e => { setMisInput(e.target.value); setMsg('mis', ''); }}
          rows={4} placeholder="BRA: 5 · 6 · 7, MEX 3 4 5..." />
        <ImportPreview text={misInput} allCodes={allCodes} owned={owned} type="missing" />
        {msgs.mis && <p className="trocas-feedback">{msgs.mis}</p>}
        <button className="trocas-primary-btn" onClick={handleImportMissing}
          disabled={busy === 'mis' || !misInput.trim()}>
          {busy === 'mis' ? 'Importando...' : '🚀 Marcar tudo exceto faltantes'}
        </button>
      </section>
    </div>
  );
}

// ─── History Drawer ───────────────────────────────────────────────────────────

function HistoryDrawer({ history, data, onClose }) {
  const groups = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);
    const map = new Map();
    for (const e of history) {
      const d = new Date(e.ts); d.setHours(0, 0, 0, 0);
      const label = d >= today ? 'HOJE' : d >= yesterday ? 'ONTEM'
        : `HÁ ${Math.round((today - d) / 86400000)} DIAS`;
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(e);
    }
    return [...map.entries()].map(([label, entries]) => ({ label, entries }));
  }, [history]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="history-drawer">
        <div className="drawer-handle" />
        <div className="drawer-header">
          <span className="drawer-title">🕐 Histórico</span>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          {history.length === 0
            ? <p className="drawer-empty">Nenhuma alteração registrada ainda.</p>
            : groups.map(g => (
                <div key={g.label} className="hist-date-group">
                  <div className="hist-date-label">{g.label}</div>
                  {g.entries.map(e => <HistEntry key={e.id} entry={e} data={data} />)}
                </div>
              ))
          }
        </div>
      </div>
    </>
  );
}

function HistEntry({ entry, data }) {
  const [expanded, setExpanded] = useState(false);
  const ago  = formatAgo(entry.ts);
  const name = entry.code ? (PLAYER_NAMES[entry.code] || '') : '';
  const iso  = entry.teamCode ? TEAM_ISO[entry.teamCode] : null;

  if (entry.type === 'batch_mark' || entry.type === 'batch_dup') {
    const isMark   = entry.type === 'batch_mark';
    const hasDetail = entry.codes?.length > 0 && data;
    const expandGroups = expanded && hasDetail ? groupByTeam(entry.codes, data) : [];

    return (
      <div className={`hist-entry hist-batch${expanded ? ' is-expanded' : ''}`}>
        <div className="hist-batch-main">
          <span className={`hist-dot ${isMark ? 'dot-green' : 'dot-amber'}`} />
          <div className="hist-info">
            <span className="hist-action-txt">
              {isMark ? `${entry.count} coladas importadas` : `${entry.count} repetidas importadas`}
            </span>
            <span className="hist-detail">{entry.teamSummary}</span>
          </div>
          <div className="hist-batch-right">
            {hasDetail && (
              <button className="hist-expand-btn" onClick={() => setExpanded(x => !x)}>
                {expanded ? '▴' : '▾'}
              </button>
            )}
            <span className="hist-ago">{ago}</span>
          </div>
        </div>
        {expanded && expandGroups.length > 0 && (
          <div className="hist-expand-body">
            {expandGroups.map(g => (
              <div key={g.key} className="hist-expand-row">
                {TEAM_ISO[g.key]
                  ? <span className={`fi fi-${TEAM_ISO[g.key]} hist-expand-flag`} />
                  : <span className="hist-expand-flag-txt">{g.flag || g.key}</span>
                }
                <span className="hist-expand-team">{g.key}</span>
                <span className="hist-expand-nums">{g.codes.map(codeNum).join(' · ')}</span>
              </div>
            ))}
          </div>
        )}
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
      <span className="hist-ago">{ago}</span>
    </div>
  );
}
