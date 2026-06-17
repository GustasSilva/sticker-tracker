'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildHistEntry, getTeamInfo, teamSummary } from '@/utils/stickers';

export default function useTrackerState(data) {
  const supabase = useMemo(() => createClient(), []);
  const [owned,      setOwned]      = useState(new Set());
  const [duplicates, setDuplicates] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [history,    setHistory]    = useState([]);

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
      const coveredCodes = new Set();
      for (const e of richEntries) {
        if (e.code) coveredCodes.add(e.code);
        if (Array.isArray(e.codes)) e.codes.forEach(c => coveredCodes.add(c));
      }
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

  return {
    owned, duplicates, history, loading,
    allCodes, missingCodes, totalAll,
    pushHist, toggle, setCount, saveDuplicates, importOwned, clearDuplicates, executeUndo,
  };
}
