'use client';

import { useCallback, useEffect, memo, useMemo, useRef, useState } from 'react';
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
    const full = { ...entry, id: entry.id ?? String(Date.now() + Math.random()), ts: entry.ts ?? new Date() };
    setHistory(h => [full, ...h.slice(0, 199)]);
    supabase.auth.getUser().then(({ data: authData }) => {
      const userId = authData?.user?.id;
      if (!userId) return;
      const payload = { ...full, ts: full.ts.toISOString() };
      supabase.from('history_events').upsert(
        { id: String(full.id), user_id: userId, type: full.type, payload, created_at: full.ts.toISOString() },
        { onConflict: 'id,user_id' }
      ).then(({ error }) => { if (error) console.error('[hist] upsert:', error); });
    });
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
      const [mainRes, histEvRes, histFallbackRes] = await Promise.all([
        supabase.from('user_progress').select('sticker_code, owned, duplicates').or('owned.eq.true,duplicates.gt.0'),
        supabase.from('history_events').select('id, type, payload, created_at').order('created_at', { ascending: false }).limit(200),
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

      if (histEvRes.error) console.error('[hist] load:', histEvRes.error);
      const richEntries = (histEvRes.data || []).map(row => ({ ...row.payload, id: row.id, ts: new Date(row.created_at) }));
      const coveredCodes = new Set(richEntries.filter(e => e.code).map(e => e.code));
      const fallbackEntries = (histFallbackRes.data || [])
        .map(row => buildHistEntry(row, data))
        .filter(e => !coveredCodes.has(e.code));
      const merged = [...richEntries, ...fallbackEntries]
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, 200);
      if (merged.length) setHistory(merged);

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
    pushHist({ type: was ? 'unmark' : 'mark', code, ...getTeamInfo(code, data), prevOwned: was, prevQty: duplicates[code] || 0 });
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
    pushHist({ type: histType, code, ...getTeamInfo(code, data), qty: dups, prevOwned: owned.has(code), prevQty: duplicates[code] || 0 });
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('user_progress').upsert(
      { user_id: userId, sticker_code: code, owned: isOwned, duplicates: dups, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,sticker_code' }
    );
  }

  // qty > 0 auto-marks as owned
  async function saveDuplicates(updates, { skipHist = false } = {}) {
    const userId  = await getUserId();
    if (!userId) return;
    const entries = Object.entries(updates);
    setDuplicates(prev => {
      const next = { ...prev };
      for (const [code, qty] of entries) {
        if (qty <= 0) delete next[code]; else next[code] = qty;
      }
      return next;
    });
    setOwned(prev => {
      const next = new Set(prev);
      for (const [code, qty] of entries) { if (qty > 0) next.add(code); }
      return next;
    });
    if (!skipHist) {
      if (entries.length === 1) {
        const [code, qty] = entries[0];
        pushHist({ type: 'dup', code, ...getTeamInfo(code, data), qty, prevOwned: owned.has(code), prevQty: duplicates[code] || 0 });
      } else if (entries.length > 1) {
        const codes = entries.map(([c]) => c);
        pushHist({ id: 'bdp_' + Date.now(), type: 'batch_dup', count: entries.length, teamSummary: teamSummary(codes, data), codes,
          prevDups: Object.fromEntries(entries.map(([c]) => [c, duplicates[c] || 0])) });
      }
    }
    await supabase.from('user_progress').upsert(
      entries.map(([code, qty]) => ({
        user_id: userId, sticker_code: code,
        owned: qty > 0 ? true : owned.has(code),
        duplicates: Math.max(0, qty), updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,sticker_code' }
    );
  }

  async function importOwned(codes, { skipHist = false } = {}) {
    const toAdd = codes.filter(c => allCodes.has(c) && !owned.has(c));
    if (!toAdd.length) return 0;
    setOwned(prev => { const next = new Set(prev); toAdd.forEach(c => next.add(c)); return next; });
    if (!skipHist) {
      if (toAdd.length === 1) {
        pushHist({ type: 'mark', code: toAdd[0], ...getTeamInfo(toAdd[0], data), prevOwned: false, prevQty: 0 });
      } else {
        pushHist({ id: 'bm_' + Date.now(), type: 'batch_mark', count: toAdd.length, teamSummary: teamSummary(toAdd, data), codes: toAdd });
      }
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
    pushHist({ id: 'cd_' + Date.now(), type: 'clear_dups', count: codes.length, teamSummary: teamSummary(codes, data), codes,
      prevDups: Object.fromEntries(codes.map(c => [c, duplicates[c]])) });
    setDuplicates({});
    await supabase.from('user_progress').upsert(
      codes.map(c => ({ user_id: userId, sticker_code: c, owned: owned.has(c), duplicates: 0, updated_at: new Date().toISOString() })),
      { onConflict: 'user_id,sticker_code' }
    );
  }

  async function executeUndo(entry) {
    const userId = await getUserId();
    if (!userId) return;

    switch (entry.type) {
      case 'mark':
      case 'unmark':
      case 'dup': {
        const wasOwned = entry.prevOwned ?? (entry.type !== 'mark');
        const prevQty  = entry.prevQty  ?? 0;
        setOwned(prev => { const next = new Set(prev); if (wasOwned) next.add(entry.code); else next.delete(entry.code); return next; });
        setDuplicates(prev => { const next = { ...prev }; if (prevQty > 0) next[entry.code] = prevQty; else delete next[entry.code]; return next; });
        await supabase.from('user_progress').upsert(
          { user_id: userId, sticker_code: entry.code, owned: wasOwned, duplicates: prevQty, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,sticker_code' }
        );
        break;
      }
      case 'batch_mark': {
        const codes = entry.codes || [];
        setOwned(prev => { const next = new Set(prev); codes.forEach(c => next.delete(c)); return next; });
        if (codes.length) await supabase.from('user_progress').upsert(
          codes.map(c => ({ user_id: userId, sticker_code: c, owned: false, duplicates: 0, updated_at: new Date().toISOString() })),
          { onConflict: 'user_id,sticker_code' }
        );
        break;
      }
      case 'batch_dup': {
        const prevDups = entry.prevDups || {};
        const codes    = entry.codes    || [];
        setDuplicates(prev => { const next = { ...prev }; codes.forEach(c => { const q = prevDups[c] ?? 0; if (q > 0) next[c] = q; else delete next[c]; }); return next; });
        if (codes.length) await supabase.from('user_progress').upsert(
          codes.map(c => ({ user_id: userId, sticker_code: c, owned: true, duplicates: prevDups[c] ?? 0, updated_at: new Date().toISOString() })),
          { onConflict: 'user_id,sticker_code' }
        );
        break;
      }
      case 'clear_dups': {
        const prevDups = entry.prevDups || {};
        setDuplicates(prev => ({ ...prev, ...prevDups }));
        const entries2 = Object.entries(prevDups);
        if (entries2.length) await supabase.from('user_progress').upsert(
          entries2.map(([c, q]) => ({ user_id: userId, sticker_code: c, owned: true, duplicates: q, updated_at: new Date().toISOString() })),
          { onConflict: 'user_id,sticker_code' }
        );
        break;
      }
      case 'open_pack': {
        const newCodes  = entry.newCodes || [];
        const prevDups  = entry.prevDups  || {};
        const allCodes2 = [...new Set([...newCodes, ...Object.keys(prevDups)])];
        setOwned(prev => { const next = new Set(prev); newCodes.forEach(c => next.delete(c)); return next; });
        setDuplicates(prev => {
          const next = { ...prev };
          for (const c of allCodes2) {
            if (newCodes.includes(c)) { delete next[c]; }
            else { const q = prevDups[c] ?? 0; if (q > 0) next[c] = q; else delete next[c]; }
          }
          return next;
        });
        if (allCodes2.length) await supabase.from('user_progress').upsert(
          allCodes2.map(c => {
            const isNew = newCodes.includes(c);
            return { user_id: userId, sticker_code: c, owned: !isNew, duplicates: isNew ? 0 : (prevDups[c] ?? 0), updated_at: new Date().toISOString() };
          }),
          { onConflict: 'user_id,sticker_code' }
        );
        break;
      }
      case 'trade': {
        const gotNewCodes = entry.gotNewCodes || [];
        const prevDups    = entry.prevDups    || {};
        const allCodes2   = [...new Set([...Object.keys(prevDups), ...gotNewCodes])];
        setOwned(prev => { const next = new Set(prev); gotNewCodes.forEach(c => next.delete(c)); return next; });
        setDuplicates(prev => {
          const next = { ...prev };
          for (const c of allCodes2) {
            if (gotNewCodes.includes(c)) { delete next[c]; }
            else { const q = prevDups[c] ?? 0; if (q > 0) next[c] = q; else delete next[c]; }
          }
          return next;
        });
        if (allCodes2.length) await supabase.from('user_progress').upsert(
          allCodes2.map(c => {
            const isNew = gotNewCodes.includes(c);
            return { user_id: userId, sticker_code: c, owned: !isNew, duplicates: isNew ? 0 : (prevDups[c] ?? 0), updated_at: new Date().toISOString() };
          }),
          { onConflict: 'user_id,sticker_code' }
        );
        break;
      }
      default: break;
    }

    setHistory(h => h.map(e => e.id === entry.id ? { ...e, isUndo: true } : e));
    const ts = (entry.ts instanceof Date ? entry.ts : new Date(entry.ts)).toISOString();
    const payload = { ...entry, isUndo: true, ts };
    supabase.from('history_events').upsert(
      { id: String(entry.id), user_id: userId, type: entry.type, payload, created_at: ts },
      { onConflict: 'id,user_id' }
    ).then(({ error }) => { if (error) console.error('[undo] upsert:', error); });
  }

  if (loading) return <div className="loading">Carregando coleção...</div>;

  const pct = Math.round((owned.size / totalAll) * 100);
  const totalDups = Object.values(duplicates).reduce((s, q) => s + q, 0);

  return (
    <div>
      <div className="app-header-wrap">
        <h1>⚽ Panini FIFA World Cup 2026</h1>
        <div id="summary">
          <span className="sum-count"><strong>{owned.size}</strong>/{totalAll} figurinhas</span>
          <span className="sum-sep">·</span>
          <span className="sum-pct">{pct}%</span>
          {totalDups > 0 && <>
            <span className="sum-sep">·</span>
            <span className="sum-dups">{totalDups} rep.</span>
          </>}
        </div>
        <div id="total-bar-wrap">
          <div id="total-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <nav className="tab-nav">
        {[['colecao','📖 Coleção'],['trocas','🔄 Trocas'],['comparar','🔍 Comparar'],['config','⚙️']].map(([id, label]) => (
          <button key={id} className={`tab-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === 'colecao'  && <ColecaoTab data={data} owned={owned} duplicates={duplicates} toggle={toggle} setCount={setCount} />}
      {tab === 'trocas'   && <TrocasTab  data={data} owned={owned} duplicates={duplicates} missingCodes={missingCodes} allCodes={allCodes} saveDuplicates={saveDuplicates} clearDuplicates={clearDuplicates} importOwned={importOwned} pushHist={pushHist} />}
      {tab === 'comparar' && <CompararTab data={data} owned={owned} duplicates={duplicates} allCodes={allCodes} />}
      {tab === 'config'   && <ConfigTab   allCodes={allCodes} owned={owned} duplicates={duplicates} importOwned={importOwned} saveDuplicates={saveDuplicates} userEmail={userEmail} />}

      {/* floating history button */}
      <button className="history-fab" onClick={() => setHistoryOpen(true)} title="Histórico de alterações">
        🕐
      </button>

      {historyOpen && <HistoryDrawer history={history} data={data} onClose={() => setHistoryOpen(false)} onUndo={executeUndo} />}
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
              foil={true} dupQty={duplicates[code] || 0} teamColor={cardColor}
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

function TrocasTab({ data, owned, duplicates, missingCodes, allCodes, saveDuplicates, clearDuplicates, importOwned, pushHist }) {
  const [packInput,     setPackInput]     = useState('');
  const [packSaving,    setPackSaving]    = useState(false);
  const [packFeedback,  setPackFeedback]  = useState('');
  const [gaveInput,     setGaveInput]     = useState('');
  const [gotInput,      setGotInput]      = useState('');
  const [tradeSaving,   setTradeSaving]   = useState(false);
  const [tradeFeedback, setTradeFeedback] = useState('');
  const [copied, setCopied] = useState('');

  async function handleOpenPack() {
    const parsed = parseStickersText(packInput);
    const codes  = Object.keys(parsed).filter(c => allCodes.has(c));
    if (!codes.length) { setPackFeedback('Nenhum código válido encontrado.'); return; }
    setPackSaving(true);
    const newOnes      = codes.filter(c => !owned.has(c));
    const alreadyOwned = codes.filter(c =>  owned.has(c));
    const packPrevDups = Object.fromEntries(alreadyOwned.map(c => [c, duplicates[c] || 0]));
    try {
      if (newOnes.length) await importOwned(newOnes, { skipHist: true });
      const dupUpdate = {};
      alreadyOwned.forEach(c => { dupUpdate[c] = (duplicates[c] || 0) + (parsed[c] || 1); });
      newOnes.filter(c => (parsed[c] || 1) > 1).forEach(c => { dupUpdate[c] = (duplicates[c] || 0) + (parsed[c] - 1); });
      if (Object.keys(dupUpdate).length) await saveDuplicates(dupUpdate, { skipHist: true });
      const totalDupAdded = alreadyOwned.reduce((s, c) => s + (parsed[c] || 1), 0)
                          + newOnes.reduce((s, c) => s + Math.max(0, (parsed[c] || 1) - 1), 0);
      pushHist({
        id: 'op_' + Date.now(),
        type: 'open_pack',
        count: newOnes.length + totalDupAdded,
        newCount: newOnes.length,
        dupCount: totalDupAdded,
        teamSummary: teamSummary(codes, data),
        codes,
        newCodes: newOnes,
        parsedQty: Object.fromEntries(codes.map(c => [c, parsed[c] || 1])),
        prevDups: packPrevDups,
      });
      setPackFeedback(`✓ ${newOnes.length} nova(s) · ${totalDupAdded} repetida(s) registrada(s).`);
      setPackInput('');
    } finally {
      setPackSaving(false);
    }
  }

  async function handleTrade() {
    const parsedGave = parseStickersText(gaveInput);
    const parsedGot  = parseStickersText(gotInput);
    const gaveCodes  = Object.keys(parsedGave).filter(c => allCodes.has(c));
    const gotCodes   = Object.keys(parsedGot).filter(c => allCodes.has(c));
    if (!gaveCodes.length && !gotCodes.length) { setTradeFeedback('Nenhum código válido encontrado.'); return; }
    const tradeAllCodes = [...new Set([...gaveCodes, ...gotCodes])];
    const tradePrevDups = Object.fromEntries(tradeAllCodes.map(c => [c, duplicates[c] || 0]));
    setTradeSaving(true);
    try {
      const gaveIgnored = [];
      const dupChanges  = {};
      for (const code of gaveCodes) {
        const base = dupChanges[code] ?? (duplicates[code] || 0);
        if (base > 0) { dupChanges[code] = base - 1; }
        else { gaveIgnored.push(code); }
      }
      const newOnes  = gotCodes.filter(c => !owned.has(c));
      const gotOwned = gotCodes.filter(c =>  owned.has(c));
      if (newOnes.length) await importOwned(newOnes, { skipHist: true });
      for (const code of gotOwned) {
        const base = dupChanges[code] ?? (duplicates[code] || 0);
        dupChanges[code] = base + 1;
      }
      if (Object.keys(dupChanges).length) await saveDuplicates(dupChanges, { skipHist: true });
      const effectiveGave = gaveCodes.filter(c => !gaveIgnored.includes(c));
      if (effectiveGave.length || gotCodes.length) {
        pushHist({
          id: 'tr_' + Date.now(),
          type: 'trade',
          gaveCount: effectiveGave.length,
          gotCount: gotCodes.length,
          gaveCodes: effectiveGave,
          gotCodes,
          gotNewCodes: newOnes,
          codes: [...effectiveGave, ...gotCodes],
          teamSummary: teamSummary([...effectiveGave, ...gotCodes], data),
          prevDups: tradePrevDups,
        });
      }
      const pl = (n, s) => n !== 1 ? s : '';
      const parts = [];
      if (effectiveGave.length) parts.push(`${effectiveGave.length} entregue${pl(effectiveGave.length, 's')}`);
      if (gotCodes.length)      parts.push(`${gotCodes.length} recebida${pl(gotCodes.length, 's')}`);
      if (gaveIgnored.length)   parts.push(`${gaveIgnored.length} sem rep. (ignorada${pl(gaveIgnored.length, 's')})`);
      setTradeFeedback('✓ ' + parts.join(' · '));
      setGaveInput(''); setGotInput('');
    } finally {
      setTradeSaving(false);
    }
  }

  const dupCodes = Object.keys(duplicates);
  const dupTotal = Object.values(duplicates).reduce((s, q) => s + q, 0);

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
        <h3>📦 Registrar abertura de envelope</h3>
        <p className="trocas-hint">Cole os códigos das figurinhas abertas. Novas são marcadas como coladas, as que você já tem viram +1 repetida automaticamente.</p>
        <textarea className="trocas-textarea" value={packInput}
          onChange={e => { setPackInput(e.target.value); setPackFeedback(''); }}
          rows={4} placeholder="BRA 6, MEX 5, IRN 7 14, FWC 3..." />
        <PackBreakdown text={packInput} allCodes={allCodes} owned={owned} duplicates={duplicates} data={data} />
        {packFeedback && <p className="trocas-feedback">{packFeedback}</p>}
        <button className="trocas-primary-btn" onClick={handleOpenPack}
          disabled={packSaving || !packInput.trim()}>
          {packSaving ? 'Registrando...' : '📦 Registrar figurinhas'}
        </button>
      </section>

      <section className="trocas-section">
        <h3>🤝 Registrar Troca</h3>
        <p className="trocas-hint">Cole as figurinhas que você entregou e recebeu. Repetidas são ajustadas automaticamente; sem duplicata disponível, a entrega é ignorada.</p>
        <div className="trade-inputs">
          <div className="trade-col">
            <span className="trade-label">➡️ Entreguei</span>
            <textarea className="trocas-textarea" value={gaveInput}
              onChange={e => { setGaveInput(e.target.value); setTradeFeedback(''); }}
              rows={3} placeholder="BRA 6, MEX 5..." />
            <ImportPreview text={gaveInput} allCodes={allCodes} owned={owned} duplicates={duplicates} type="trade_give" />
          </div>
          <div className="trade-col">
            <span className="trade-label">⬅️ Recebi</span>
            <textarea className="trocas-textarea" value={gotInput}
              onChange={e => { setGotInput(e.target.value); setTradeFeedback(''); }}
              rows={3} placeholder="IRN 9, FWC 3..." />
            <ImportPreview text={gotInput} allCodes={allCodes} owned={owned} duplicates={duplicates} type="trade_got" />
          </div>
        </div>
        {tradeFeedback && <p className="trocas-feedback">{tradeFeedback}</p>}
        <button className="trocas-primary-btn" onClick={handleTrade}
          disabled={tradeSaving || (!gaveInput.trim() && !gotInput.trim())}>
          {tradeSaving ? 'Registrando...' : '🤝 Registrar Troca'}
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
        <ImportPreview text={theirDups} allCodes={allCodes} owned={owned} duplicates={duplicates} type="compare_dup" />
      </section>

      <section className="trocas-section">
        <h3>❓ Faltantes do parceiro <span className="opt-badge">opcional</span></h3>
        <p className="trocas-hint">O que <strong>ele precisa</strong> — você verá o que pode oferecer das suas repetidas.</p>
        <textarea className="trocas-textarea" value={theirMis}
          onChange={e => { setTheirMis(e.target.value); setResult(null); }}
          rows={4} placeholder="BRA: 5 · 6 · 7, GER 2, ARG 14..." />
        <ImportPreview text={theirMis} allCodes={allCodes} owned={owned} duplicates={duplicates} type="compare_missing" />
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

function PackBreakdown({ text, allCodes, owned, duplicates, data }) {
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

function ImportPreview({ text, allCodes, owned, duplicates, type }) {
  return useMemo(() => {
    if (!text.trim()) return null;
    const parsed  = parseStickersText(text);
    const keys    = Object.keys(parsed);
    const valid   = keys.filter(c => allCodes.has(c));
    const invalid = keys.length - valid.length;
    const pl = n => n !== 1;

    let msg;
    if (type === 'owned') {
      const newOnes = valid.filter(c => !owned.has(c)).length;
      msg = newOnes > 0
        ? `${newOnes} nova${pl(newOnes) ? 's' : ''} para marcar de ${valid.length} identificadas`
        : `Todas as ${valid.length} já estão coladas`;
    } else if (type === 'dup') {
      const totalCopies = valid.reduce((s, c) => s + (parsed[c] || 1), 0);
      const updating    = duplicates ? valid.filter(c => (duplicates[c] || 0) > 0).length : 0;
      msg = `${valid.length} figurinha${pl(valid.length) ? 's' : ''} · ${totalCopies} repetida${pl(totalCopies) ? 's' : ''} no total`;
      if (updating > 0) msg += ` · ${updating} já cadastrada${pl(updating) ? 's' : ''} (serão atualizadas)`;
    } else if (type === 'open_pack') {
      const newUnique = valid.filter(c => !owned.has(c));
      const dupCodes  = valid.filter(c =>  owned.has(c));
      const newCount  = newUnique.length;
      const totalDups = dupCodes.reduce((s, c) => s + (parsed[c] || 1), 0)
                      + newUnique.reduce((s, c) => s + Math.max(0, (parsed[c] || 1) - 1), 0);
      const parts = [];
      if (newCount  > 0) parts.push(`${newCount} nova${pl(newCount) ? 's' : ''}`);
      if (totalDups > 0) parts.push(`${totalDups} repetida${pl(totalDups) ? 's' : ''}`);
      msg = parts.length ? parts.join(' · ') : `${valid.length} figurinha${pl(valid.length) ? 's' : ''} identificadas`;
    } else if (type === 'trade_give') {
      const canGive = valid.filter(c => (duplicates?.[c] || 0) > 0).length;
      const noStock = valid.length - canGive;
      const parts   = [`${canGive} entregável${pl(canGive) ? 'is' : ''}`];
      if (noStock > 0) parts.push(`${noStock} sem repetidas (ignorada${pl(noStock) ? 's' : ''})`);
      msg = parts.join(' · ');
    } else if (type === 'trade_got') {
      const newOnes = valid.filter(c => !owned.has(c)).length;
      const dupOnes = valid.length - newOnes;
      const parts   = [];
      if (newOnes > 0) parts.push(`${newOnes} nova${pl(newOnes) ? 's' : ''}`);
      if (dupOnes > 0) parts.push(`${dupOnes} vira${pl(dupOnes) ? 'm' : ''} repetida${pl(dupOnes) ? 's' : ''}`);
      msg = parts.length ? parts.join(' · ') : `${valid.length} figurinha${pl(valid.length) ? 's' : ''} identificadas`;
    } else if (type === 'compare_dup') {
      const canGet = valid.filter(c => !owned.has(c)).length;
      msg = `${valid.length} figurinha${pl(valid.length) ? 's' : ''} identificadas · ${canGet} que você não tem (pode pegar)`;
    } else if (type === 'compare_missing') {
      const myDupSet = new Set(Object.keys(duplicates || {}));
      const canOffer = valid.filter(c => myDupSet.has(c)).length;
      msg = `${valid.length} faltante${pl(valid.length) ? 's' : ''} identificada${pl(valid.length) ? 's' : ''} · ${canOffer} intersectam suas repetidas (pode oferecer)`;
    } else {
      const misSet = new Set(valid);
      const toMark = [...allCodes].filter(c => !misSet.has(c) && !owned.has(c)).length;
      msg = `${toMark} figurinha${pl(toMark) ? 's' : ''} novas a marcar (excluindo ${valid.length} faltantes)`;
    }

    return (
      <p className="import-preview">
        📋 {msg}{invalid > 0 ? ` · ${invalid} entrada${pl(invalid) ? 's' : ''} inválida${pl(invalid) ? 's' : ''} ignorada${pl(invalid) ? 's' : ''}` : ''}
      </p>
    );
  }, [text, allCodes, owned, duplicates, type]);
}

function ConfigTab({ allCodes, owned, duplicates, importOwned, saveDuplicates, userEmail }) {
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
      {userEmail && (
        <section className="trocas-section config-user-section">
          <div className="config-user-row">
            <span className="config-user-email">👤 {userEmail}</span>
            <form action="/logout" method="post">
              <button type="submit" className="config-logout-btn">Sair</button>
            </form>
          </div>
        </section>
      )}

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

function HistoryDrawer({ history, data, onClose, onUndo }) {
  const [pendingUndo, setPendingUndo] = useState(null);

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

  const firstUndoableId = useMemo(() => history.find(e => !e.isUndo)?.id, [history]);

  function confirmUndo() {
    if (pendingUndo) onUndo(pendingUndo);
    setPendingUndo(null);
  }

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
                  {g.entries.map(e => (
                    <HistEntry
                      key={e.id}
                      entry={e}
                      data={data}
                      isFirst={e.id === firstUndoableId}
                      onUndo={setPendingUndo}
                    />
                  ))}
                </div>
              ))
          }
        </div>
      </div>
      {pendingUndo && (
        <div className="undo-modal-backdrop" onClick={() => setPendingUndo(null)}>
          <div className="undo-modal" onClick={e => e.stopPropagation()}>
            <p className="undo-modal-title">Desfazer operação?</p>
            <p className="undo-modal-note">Esta ação não pode ser desfeita automaticamente. Para reverter, seria necessário repetir a operação manualmente.</p>
            <div className="undo-modal-btns">
              <button className="undo-modal-cancel" onClick={() => setPendingUndo(null)}>Cancelar</button>
              <button className="undo-modal-confirm" onClick={confirmUndo}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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

  const BATCH_TYPES = ['batch_mark', 'batch_dup', 'open_pack', 'clear_dups', 'trade'];
  if (BATCH_TYPES.includes(entry.type)) {
    const hasDetail  = entry.codes?.length > 0 && data;
    const expandGroups = expanded && hasDetail ? groupByTeam(entry.codes, data) : [];

    let dotCls, actionTxt;
    if (entry.type === 'batch_mark')  { dotCls = 'dot-green';  actionTxt = `${entry.count} coladas importadas`; }
    else if (entry.type === 'batch_dup')   { dotCls = 'dot-amber';  actionTxt = `${entry.count} repetidas importadas`; }
    else if (entry.type === 'open_pack')   { dotCls = 'dot-green';  actionTxt = `📦 ${entry.count} figurinhas — ${entry.newCount} novas · ${entry.dupCount} repetidas`; }
    else if (entry.type === 'trade') {
      dotCls = 'dot-blue';
      const tp = [];
      if (entry.gaveCount > 0) tp.push(`${entry.gaveCount} entregue${entry.gaveCount !== 1 ? 's' : ''}`);
      if (entry.gotCount  > 0) tp.push(`${entry.gotCount} recebida${entry.gotCount !== 1 ? 's' : ''}`);
      actionTxt = `🤝 Troca — ${tp.join(' · ')}`;
    }
    else                                   { dotCls = 'dot-red';    actionTxt = `🗑 ${entry.count} repetidas zeradas`; }

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
            const renderRow = (g, renderChip) => (
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
