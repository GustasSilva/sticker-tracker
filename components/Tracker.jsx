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
  // strip emoji/non-ASCII, keep alphanumeric + separators
  const cleaned = text.replace(/[^\w\s:,.;·()\-]/g, ' ');
  const upper = cleaned.toUpperCase().replace(/[·;]/g, ' ').replace(/,/g, ' ');
  const tokens = upper.split(/\s+/).filter(Boolean);
  let lastPrefix = null;

  for (const token of tokens) {
    // Team prefix with optional colon: "BRA" or "BRA:"
    if (/^[A-Z]{2,4}:?$/.test(token)) {
      lastPrefix = token.replace(':', '');
      continue;
    }
    // Combined code+num: "BRA3" or "BRA3(2X)"
    const combined = token.match(/^([A-Z]{2,4})(\d+)(?:\((\d+)X?\))?$/);
    if (combined) {
      const code = combined[1] + parseInt(combined[2]);
      const qty = combined[3] ? parseInt(combined[3]) : 1;
      result[code] = (result[code] || 0) + qty;
      lastPrefix = combined[1];
      continue;
    }
    // Number only: "3" or "3(2X)"
    const numOnly = token.match(/^(\d+)(?:\((\d+)X?\))?$/);
    if (numOnly && lastPrefix) {
      const code = lastPrefix + parseInt(numOnly[1]);
      const qty = numOnly[2] ? parseInt(numOnly[2]) : 1;
      result[code] = (result[code] || 0) + qty;
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

function DupModal({ code, initial, onSave, onClose }) {
  const [qty, setQty] = useState(initial);
  const name = PLAYER_NAMES[code] || '';
  return (
    <div className="dup-modal-backdrop" onClick={onClose}>
      <div className="dup-modal" onClick={e => e.stopPropagation()}>
        <div className="dup-modal-title">
          <span className="dup-modal-code">{code}</span>
          {name && <span className="dup-modal-name">{name}</span>}
        </div>
        <div className="dup-modal-controls">
          <button className="dup-modal-btn" onClick={() => setQty(q => Math.max(0, q - 1))}>−</button>
          <span className="dup-modal-qty">{qty}</span>
          <button className="dup-modal-btn" onClick={() => setQty(q => q + 1)}>+</button>
        </div>
        <div className="dup-modal-label">repetida(s)</div>
        <button className="dup-modal-save" onClick={() => onSave(code, qty)}>Salvar</button>
      </div>
    </div>
  );
}

// ─── Main Tracker ─────────────────────────────────────────────────────────────

export default function Tracker({ data, userEmail }) {
  const supabase = useMemo(() => createClient(), []);
  const [owned, setOwned] = useState(new Set());
  const [duplicates, setDuplicates] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('colecao');

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
      let rows;
      const { data: d, error } = await supabase
        .from('user_progress')
        .select('sticker_code, owned, duplicates')
        .or('owned.eq.true,duplicates.gt.0');
      if (error) {
        const { data: fallback } = await supabase
          .from('user_progress').select('sticker_code, owned').eq('owned', true);
        rows = fallback;
      } else {
        rows = d;
      }
      if (!active) return;
      if (rows) {
        const ownedSet = new Set();
        const dupMap = {};
        for (const r of rows) {
          if (r.owned) ownedSet.add(r.sticker_code);
          if (r.duplicates > 0) dupMap[r.sticker_code] = r.duplicates;
        }
        setOwned(ownedSet);
        setDuplicates(dupMap);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [supabase]);

  const getUserId = useCallback(async () => {
    const { data: d } = await supabase.auth.getUser();
    return d?.user?.id;
  }, [supabase]);

  async function toggle(code) {
    const next = new Set(owned);
    const was = next.has(code);
    if (was) next.delete(code); else next.add(code);
    setOwned(next);
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('user_progress').upsert(
      { user_id: userId, sticker_code: code, owned: !was, duplicates: duplicates[code] ?? 0, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,sticker_code' }
    );
  }

  // When qty > 0: auto-mark sticker as owned too
  async function saveDuplicates(updates) {
    const userId = await getUserId();
    if (!userId) return;
    const newDups = { ...duplicates };
    const newOwned = new Set(owned);
    for (const [code, qty] of Object.entries(updates)) {
      if (qty <= 0) {
        delete newDups[code];
      } else {
        newDups[code] = qty;
        newOwned.add(code); // having duplicates implies owning the sticker
      }
    }
    setDuplicates(newDups);
    setOwned(newOwned);
    await supabase.from('user_progress').upsert(
      Object.entries(updates).map(([code, qty]) => ({
        user_id: userId, sticker_code: code,
        owned: newOwned.has(code),
        duplicates: Math.max(0, qty), updated_at: new Date().toISOString(),
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

  return (
    <div>
      <h1>⚽ Panini FIFA World Cup 2026</h1>
      <div id="summary">
        {owned.size}/{totalAll} figurinhas ({pct}%) — {userEmail}
        {' · '}
        <form action="/logout" method="post" style={{ display: 'inline' }}>
          <button type="submit" className="link-btn">Sair</button>
        </form>
      </div>
      <div id="total-bar-wrap">
        <div id="total-bar" style={{ width: `${pct}%` }} />
      </div>

      <nav className="tab-nav">
        {[['colecao','📖 Coleção'],['trocas','🔄 Trocas'],['comparar','🔍 Comparar'],['config','⚙️']].map(([id, label]) => (
          <button key={id} className={`tab-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === 'colecao'  && <ColecaoTab data={data} owned={owned} duplicates={duplicates} toggle={toggle} saveDuplicates={saveDuplicates} />}
      {tab === 'trocas'   && <TrocasTab data={data} owned={owned} duplicates={duplicates} missingCodes={missingCodes} allCodes={allCodes} saveDuplicates={saveDuplicates} clearDuplicates={clearDuplicates} />}
      {tab === 'comparar' && <CompararTab data={data} owned={owned} duplicates={duplicates} allCodes={allCodes} />}
      {tab === 'config'   && <ConfigTab allCodes={allCodes} owned={owned} duplicates={duplicates} importOwned={importOwned} saveDuplicates={saveDuplicates} />}
    </div>
  );
}

// ─── Coleção ──────────────────────────────────────────────────────────────────

function ColecaoTab({ data, owned, duplicates, toggle, saveDuplicates }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dupModal, setDupModal] = useState(null);
  const q = normalize(search.trim());

  function openDupModal(code) { setDupModal({ code }); }

  async function handleDupSave(code, qty) {
    await saveDuplicates({ [code]: qty });
    setDupModal(null);
  }

  return (
    <div>
      <div className="controls-bar">
        <div className="filter-bar">
          {[['all','Todas'],['incomplete','Incompletas'],['complete','Completas'],['none','Vazias']].map(([m, l]) => (
            <button key={m} className={filter === m ? 'active' : ''} onClick={() => setFilter(m)}>{l}</button>
          ))}
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="🔍 Buscar por código, jogador ou seleção..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid">
        <SpecialCard
          title="✦ Página Inicial / FIFA World Cup History"
          codes={data.specials}
          owned={owned} duplicates={duplicates} toggle={toggle}
          extraClass="intro-card" filter={filter} search={q}
          cardColor="#B08030" onLongPress={openDupModal}
        />
        <SpecialCard
          title="🥤 Coca-Cola Bonus Stickers"
          codes={data.coke}
          owned={owned} duplicates={duplicates} toggle={toggle}
          extraClass="coke-card" filter={filter} search={q}
          cardColor="#CC0000" onLongPress={openDupModal}
        />
        {data.teams.map(team => (
          <TeamCard key={team.code} team={team} owned={owned} duplicates={duplicates}
            toggle={toggle} filter={filter} search={q} onLongPress={openDupModal} />
        ))}
      </div>

      {dupModal && (
        <DupModal
          code={dupModal.code}
          initial={duplicates[dupModal.code] || 0}
          onSave={handleDupSave}
          onClose={() => setDupModal(null)}
        />
      )}
    </div>
  );
}

function SpecialCard({ title, codes, owned, duplicates, toggle, extraClass, filter, search, cardColor, onLongPress }) {
  const n = countOwned(codes, owned);
  const total = codes.length;
  const displayed = search ? codes.filter(c => matchesSearch(c, search)) : codes;

  if (displayed.length === 0) return null;
  if (!search) {
    if (filter === 'complete'   && n < total) return null;
    if (filter === 'none'       && n > 0)     return null;
    if (filter === 'incomplete' && (n === 0 || n === total)) return null;
  }

  return (
    <div className={`team-card ${extraClass}`}>
      <div className="team-header">
        <span className="team-name">{title}</span>
        <span className="team-count">{n}/{total}</span>
      </div>
      <div className="team-progress">
        <div className="team-progress-fill" style={{ width: `${(n / total) * 100}%` }} />
      </div>
      <div className="stickers special-stickers">
        {displayed.map(code => (
          <StickerBox key={code} code={code} owned={owned.has(code)} onToggle={() => toggle(code)}
            dupQty={duplicates[code] || 0} teamColor={cardColor} onLongPress={() => onLongPress(code)} />
        ))}
      </div>
    </div>
  );
}

function TeamCard({ team, owned, duplicates, toggle, filter, search, onLongPress }) {
  const n = countOwned(team.stickers, owned);
  const total = team.stickers.length;
  const teamColor = TEAM_COLORS[team.code] || '#1e3055';

  const displayed = search
    ? team.stickers.filter(c => matchesSearch(c, search, team.name, team.code))
    : team.stickers;

  if (displayed.length === 0) return null;
  if (!search && !shouldShow(filter, n, total)) return null;

  const complete = n === total;

  return (
    <div className={`team-card${complete ? ' team-complete' : ''}`}>
      <div className="team-header">
        <span className="team-name">
          <Flag teamCode={team.code} />
          {team.group} · {team.name}
        </span>
        <span className="team-count">{n}/{total}</span>
      </div>
      <div className="team-progress">
        <div className="team-progress-fill" style={{ width: `${(n / total) * 100}%` }} />
      </div>
      <div className="stickers">
        {displayed.map(code => {
          const posIdx = team.stickers.indexOf(code);
          return (
            <StickerBox key={code} code={code} owned={owned.has(code)} onToggle={() => toggle(code)}
              foil={posIdx === 0} special={posIdx === 12}
              dupQty={duplicates[code] || 0} teamColor={teamColor}
              onLongPress={() => onLongPress(code)} />
          );
        })}
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
  const tip    = [code, name && `· ${name}`, dupQty > 0 && `(${dupQty}x repetida)`].filter(Boolean).join(' ');

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
        <span className="sticker-pos">
          {prefix && <span className="sticker-prefix">{prefix}</span>}
          <span className="sticker-num-big">{num}</span>
        </span>
        {dupQty > 0 && <span className="dup-corner">{dupQty}x</span>}
        {name && <span className="sticker-name">{name}</span>}
      </div>
    </div>
  );
}

// ─── Trocas ───────────────────────────────────────────────────────────────────

function TrocasTab({ data, owned, duplicates, missingCodes, allCodes, saveDuplicates, clearDuplicates }) {
  const [input, setInput]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied]   = useState('');

  const dupCodes = Object.keys(duplicates);
  const dupTotal = Object.values(duplicates).reduce((s, q) => s + q, 0);

  async function markDuplicates() {
    if (!input.trim()) return;
    setSaving(true); setFeedback('');
    const parsed = parseStickersText(input);
    const valid = {};
    for (const [code, qty] of Object.entries(parsed)) {
      if (allCodes.has(code)) valid[code] = qty;
    }
    const count = Object.keys(valid).length;
    if (!count) { setFeedback('Nenhum código válido. Use: MEX 5, BRA: 13, CAN 3(2x)'); setSaving(false); return; }
    await saveDuplicates(valid);
    setInput(''); setFeedback(`✓ ${count} figurinha(s) marcada(s) como repetidas (e coladas).`);
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
        <p className="trocas-hint">Formatos aceitos: <code>MEX 5(2x)</code> ou <code>BRA: 13, 14</code> ou <code>CAN 3</code></p>
        <p className="trocas-hint">Figurinhas com repetidas são automaticamente marcadas como coladas.</p>
        <textarea className="trocas-textarea" value={input} onChange={e => setInput(e.target.value)}
          placeholder="Pan: 9(2x), Bra: 13(1x), MEX 5..." rows={4} />
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
                    <GroupFlag groupKey={g.key} fallback={g.flag} />
                    {g.label}:
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
                    <GroupFlag groupKey={g.key} fallback={g.flag} />
                    {g.label}:
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

// ─── Comparar ─────────────────────────────────────────────────────────────────

function CompararTab({ data, owned, duplicates, allCodes }) {
  const [mode, setMode]       = useState('pegar');
  const [input, setInput]     = useState('');
  const [result, setResult]   = useState(null);
  const [copied, setCopied]   = useState(false);

  function compare() {
    const parsed = parseStickersText(input);
    const codes = Object.keys(parsed).filter(c => allCodes.has(c));
    const matches = mode === 'pegar'
      ? codes.filter(c => !owned.has(c))
      : codes.filter(c => (duplicates[c] || 0) > 0);
    setResult(matches);
    setCopied(false);
  }

  function switchMode(m) { setMode(m); setResult(null); setInput(''); }

  function copyResult() {
    if (!result?.length) return;
    const header = mode === 'pegar' ? 'Figurinhas que posso pegar:' : 'Figurinhas que posso dar:';
    const body = groupByTeam(result, data).map(formatGroupLine).join('\n');
    navigator.clipboard.writeText(`${header}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const resultGroups = result ? groupByTeam(result, data) : [];
  const dupCount = Object.keys(duplicates).length;

  return (
    <div className="trocas-wrap">
      <div className="comparar-tabs">
        <button className={`comparar-tab${mode === 'pegar' ? ' active' : ''}`} onClick={() => switchMode('pegar')}>
          📥 O que posso pegar?
        </button>
        <button className={`comparar-tab${mode === 'dar' ? ' active' : ''}`} onClick={() => switchMode('dar')}>
          📤 O que posso dar?
        </button>
      </div>

      <div className="comparar-status">
        Você tem <strong>{owned.size}</strong> figurinhas coladas e <strong>{dupCount}</strong> repetidas cadastradas.
      </div>

      <section className="trocas-section">
        {mode === 'pegar' ? (
          <>
            <p className="trocas-hint">Cole as figurinhas <strong>REPETIDAS</strong> da outra pessoa.</p>
            <p className="trocas-hint">Resultado: quais dessas você ainda <strong>não tem</strong> (pode pegar).</p>
          </>
        ) : (
          <>
            <p className="trocas-hint">Cole as figurinhas que <strong>FALTAM</strong> para a outra pessoa.</p>
            <p className="trocas-hint">Resultado: quais dessas você tem como <strong>repetida</strong> para dar.</p>
          </>
        )}
        <p className="trocas-hint"><em>Formato aceito:</em> FWC 1, MEX 5, BRA: 13 · 14 ...</p>
        <textarea className="trocas-textarea" value={input}
          onChange={e => { setInput(e.target.value); setResult(null); }}
          rows={5} placeholder="FWC 1, MEX 5, BRA: 13 · 14..." />
        <button className="trocas-primary-btn" onClick={compare} disabled={!input.trim()}>
          🔍 Comparar agora
        </button>
      </section>

      {result !== null && (
        <section className="trocas-section">
          <div className="trocas-section-header">
            <h3>
              {result.length
                ? `${result.length} figurinha(s) ${mode === 'pegar' ? 'que você pode pegar' : 'que você pode dar'}:`
                : mode === 'pegar'
                  ? 'Você já tem todas essas figurinhas!'
                  : 'Nenhuma dessas você tem de repetida.'}
            </h3>
            {result.length > 0 && (
              <button className="trocas-copy-btn" onClick={copyResult}>
                {copied ? '✓ Copiado!' : '📋 Copiar'}
              </button>
            )}
          </div>
          {resultGroups.length > 0 && (
            <div className="trocas-codes-display">
              {resultGroups.map(g => (
                <div key={g.key} className="trocas-group">
                  <span className="trocas-group-label">
                    <GroupFlag groupKey={g.key} fallback={g.flag} />
                    {g.label}:
                  </span>
                  <span className="trocas-group-codes">
                    {g.codes.map(c => <span key={c} className="trocas-code">{codeNum(c)}</span>)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Config / Importação ──────────────────────────────────────────────────────

function ConfigTab({ allCodes, owned, duplicates, importOwned, saveDuplicates }) {
  const [ownedInput, setOwnedInput] = useState('');
  const [dupInput,   setDupInput]   = useState('');
  const [misInput,   setMisInput]   = useState('');
  const [busy,   setBusy]   = useState('');
  const [msgs,   setMsgs]   = useState({});

  function setMsg(k, v) { setMsgs(m => ({ ...m, [k]: v })); }

  async function handleImportOwned() {
    setBusy('owned');
    const parsed = parseStickersText(ownedInput);
    const codes = Object.keys(parsed).filter(c => allCodes.has(c));
    const count = await importOwned(codes);
    setMsg('owned', count > 0 ? `✓ ${count} figurinha(s) nova(s) marcada(s) como coladas.` : 'Nenhuma figurinha nova encontrada.');
    if (count > 0) setOwnedInput('');
    setBusy('');
  }

  async function handleImportDup() {
    setBusy('dup');
    const parsed = parseStickersText(dupInput);
    const valid = {};
    for (const [code, qty] of Object.entries(parsed)) {
      if (allCodes.has(code)) valid[code] = qty;
    }
    const count = Object.keys(valid).length;
    if (count) {
      await saveDuplicates(valid);
      setMsg('dup', `✓ ${count} figurinha(s) de repetidas importadas (marcadas como coladas também).`);
      setDupInput('');
    } else {
      setMsg('dup', 'Nenhum código válido encontrado.');
    }
    setBusy('');
  }

  async function handleImportMissing() {
    setBusy('mis');
    const parsed = parseStickersText(misInput);
    const missingSet = new Set(Object.keys(parsed).filter(c => allCodes.has(c)));
    const toOwn = [...allCodes].filter(c => !missingSet.has(c));
    const count = await importOwned(toOwn);
    setMsg('mis', count > 0
      ? `✓ ${count} figurinha(s) marcada(s) como coladas (exceto as ${missingSet.size} faltantes da lista).`
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
        {msgs.owned && <p className="trocas-feedback">{msgs.owned}</p>}
        <button className="trocas-primary-btn" onClick={handleImportOwned}
          disabled={busy === 'owned' || !ownedInput.trim()}>
          {busy === 'owned' ? 'Importando...' : '✅ Marcar como coladas'}
        </button>
      </section>

      <section className="trocas-section">
        <h3>🔄 Importar repetidas</h3>
        <p className="trocas-hint">Cole a lista de repetidas com quantidade. Figurinhas com repetidas são automaticamente marcadas como coladas.</p>
        <p className="trocas-hint"><em>Formato:</em> <code>BRA 3(2x)</code> ou <code>MEX: 5 6(3x)</code></p>
        <textarea className="trocas-textarea" value={dupInput}
          onChange={e => { setDupInput(e.target.value); setMsg('dup', ''); }}
          rows={4} placeholder="BRA 3(2x), MEX: 5 6(3x), FWC 1..." />
        {msgs.dup && <p className="trocas-feedback">{msgs.dup}</p>}
        <button className="trocas-primary-btn" onClick={handleImportDup}
          disabled={busy === 'dup' || !dupInput.trim()}>
          {busy === 'dup' ? 'Importando...' : '📌 Importar repetidas'}
        </button>
      </section>

      <section className="trocas-section">
        <h3>❓ Importar faltantes</h3>
        <p className="trocas-hint">Cole a lista de figurinhas que você <strong>NÃO tem</strong>. Tudo que não estiver na lista será marcado como colado automaticamente.</p>
        <p className="trocas-hint">⚠️ Não desmarca figurinhas já coladas. Apenas adiciona novas.</p>
        <textarea className="trocas-textarea" value={misInput}
          onChange={e => { setMisInput(e.target.value); setMsg('mis', ''); }}
          rows={4} placeholder="BRA: 5 · 6 · 7, MEX 3 4 5..." />
        {msgs.mis && <p className="trocas-feedback">{msgs.mis}</p>}
        <button className="trocas-primary-btn" onClick={handleImportMissing}
          disabled={busy === 'mis' || !misInput.trim()}>
          {busy === 'mis' ? 'Importando...' : '🚀 Marcar tudo exceto faltantes'}
        </button>
      </section>
    </div>
  );
}
