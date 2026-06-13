'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PLAYER_NAMES, TEAM_FLAGS } from '@/data/players';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseStickersText(text) {
  const result = {};
  const upper = text.toUpperCase().replace(/[·;]/g, ' ').replace(/,/g, ' ');
  const tokens = upper.split(/\s+/).filter(Boolean);
  let lastPrefix = null;

  for (const token of tokens) {
    if (/^[A-Z]{2,4}$/.test(token)) { lastPrefix = token; continue; }

    const combined = token.match(/^([A-Z]{2,4})(\d+)(?:\((\d+)X?\))?$/);
    if (combined) {
      const code = combined[1] + parseInt(combined[2]);
      const qty = combined[3] ? parseInt(combined[3]) : 1;
      result[code] = (result[code] || 0) + qty;
      lastPrefix = combined[1];
      continue;
    }

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

function formatCode(code) {
  const m = code.match(/^([A-Z]+)(\d+)$/);
  if (!m) return code;
  return `${m[1]} ${m[2].padStart(2, '0')}`;
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
    if (tc.length) groups.push({ key: team.code, label: team.name, flag: TEAM_FLAGS[team.code] || '🏳', codes: tc });
  }
  return groups;
}

function generateDupText(duplicates, data) {
  const lines = ['Tenho essas figurinhas REPETIDAS da Copa 2026 disponíveis pra troca!', ''];
  for (const g of groupByTeam(duplicates, data)) {
    lines.push(`${g.flag} ${g.label.toUpperCase()}`);
    lines.push(g.codes.map(c => `${formatCode(c)}${(duplicates[c] || 1) > 1 ? ` (${duplicates[c]}x)` : ''}`).join(', '));
    lines.push('');
  }
  return lines.join('\n').trim();
}

function generateMissingText(missingCodes, data) {
  const lines = ['Preciso dessas figurinhas da Copa 2026!', ''];
  for (const g of groupByTeam(missingCodes, data)) {
    lines.push(`${g.flag} ${g.label.toUpperCase()}`);
    lines.push(`${g.key}: ${g.codes.map(c => c.replace(g.key, '')).join(' · ')}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

function countOwned(codes, owned) { return codes.filter(c => owned.has(c)).length; }

function shouldShow(filter, n, total) {
  if (filter === 'incomplete') return n > 0 && n < total;
  if (filter === 'complete') return n === total;
  if (filter === 'none') return n === 0;
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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

  async function saveDuplicates(updates) {
    const userId = await getUserId();
    if (!userId) return;
    const newDups = { ...duplicates };
    for (const [code, qty] of Object.entries(updates)) {
      if (qty <= 0) delete newDups[code]; else newDups[code] = qty;
    }
    setDuplicates(newDups);
    await supabase.from('user_progress').upsert(
      Object.entries(updates).map(([code, qty]) => ({
        user_id: userId, sticker_code: code, owned: owned.has(code),
        duplicates: Math.max(0, qty), updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,sticker_code' }
    );
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
        {[['colecao','📖 Coleção'],['trocas','🔄 Trocas'],['comparar','🔍 Comparar']].map(([id, label]) => (
          <button key={id} className={`tab-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === 'colecao' && <ColecaoTab data={data} owned={owned} duplicates={duplicates} toggle={toggle} />}
      {tab === 'trocas' && <TrocasTab data={data} owned={owned} duplicates={duplicates} missingCodes={missingCodes} allCodes={allCodes} saveDuplicates={saveDuplicates} clearDuplicates={clearDuplicates} />}
      {tab === 'comparar' && <CompararTab data={data} owned={owned} duplicates={duplicates} allCodes={allCodes} />}
    </div>
  );
}

// ─── Coleção ──────────────────────────────────────────────────────────────────

function ColecaoTab({ data, owned, duplicates, toggle }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const q = search.toLowerCase().trim();

  function teamMatches(team) {
    if (!q) return true;
    if (team.name.toLowerCase().includes(q)) return true;
    return team.stickers.some(c =>
      c.toLowerCase().includes(q) || (PLAYER_NAMES[c] || '').toLowerCase().includes(q)
    );
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
          placeholder="🔍 Buscar por código ou jogador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid">
        <SpecialCard title="✦ Página Inicial / FIFA World Cup History" codes={data.specials} owned={owned} duplicates={duplicates} toggle={toggle} extraClass="intro-card" filter={filter} />
        <SpecialCard title="🥤 Coca-Cola Bonus Stickers" codes={data.coke} owned={owned} duplicates={duplicates} toggle={toggle} extraClass="coke-card coke-sticker" filter={filter} />
        {data.teams.map(team =>
          teamMatches(team)
            ? <TeamCard key={team.code} team={team} owned={owned} duplicates={duplicates} toggle={toggle} filter={filter} />
            : null
        )}
      </div>
    </div>
  );
}

function SpecialCard({ title, codes, owned, duplicates, toggle, extraClass, filter }) {
  const n = countOwned(codes, owned);
  return (
    <div className={`team-card ${extraClass}`}>
      <div className="team-header">
        <span className="team-name">{title}</span>
        <span className="team-count">{n}/{codes.length}</span>
      </div>
      <div className="team-progress">
        <div className="team-progress-fill" style={{ width: `${(n / codes.length) * 100}%` }} />
      </div>
      <div className="stickers">
        {codes.map((code, idx) => (
          <StickerBox key={code} code={code} label={idx + 1} owned={owned.has(code)} onToggle={() => toggle(code)} dupQty={duplicates[code] || 0} />
        ))}
      </div>
    </div>
  );
}

function TeamCard({ team, owned, duplicates, toggle, filter }) {
  const n = countOwned(team.stickers, owned);
  const total = team.stickers.length;
  if (!shouldShow(filter, n, total)) return null;
  const complete = n === total;
  const flag = TEAM_FLAGS[team.code] || '';

  return (
    <div className={`team-card${complete ? ' team-complete' : ''}`}>
      <div className="team-header">
        <span className="team-name">{flag} {team.group} · {team.name}</span>
        <span className="team-count">{n}/{total}</span>
      </div>
      <div className="team-progress">
        <div className="team-progress-fill" style={{ width: `${(n / total) * 100}%` }} />
      </div>
      <div className="stickers">
        {team.stickers.map((code, idx) => (
          <StickerBox
            key={code}
            code={code}
            label={idx + 1}
            owned={owned.has(code)}
            onToggle={() => toggle(code)}
            foil={idx === 0}
            special={idx === 12}
            dupQty={duplicates[code] || 0}
          />
        ))}
      </div>
    </div>
  );
}

function StickerBox({ code, label, owned, onToggle, foil, special, dupQty }) {
  const name = PLAYER_NAMES[code];
  const tooltip = [code, name && `· ${name}`, dupQty > 0 && `(${dupQty}x repetida)`].filter(Boolean).join(' ');

  return (
    <label
      className={`sticker-label${foil ? ' foil-sticker' : ''}${special ? ' special-sticker' : ''}${owned ? ' is-checked' : ''}`}
      title={tooltip}
    >
      <input type="checkbox" checked={owned} onChange={onToggle} />
      <div className="sticker-box" />
      <span className="sticker-num">
        {label}
        {dupQty > 0 && <span className="dup-badge">{dupQty}</span>}
      </span>
    </label>
  );
}

// ─── Trocas ───────────────────────────────────────────────────────────────────

function TrocasTab({ data, owned, duplicates, missingCodes, allCodes, saveDuplicates, clearDuplicates }) {
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState('');

  const dupTotal = Object.values(duplicates).reduce((s, q) => s + q, 0);

  async function markDuplicates() {
    if (!input.trim()) return;
    setSaving(true);
    setFeedback('');
    const parsed = parseStickersText(input);
    const valid = {};
    for (const [code, qty] of Object.entries(parsed)) {
      if (allCodes.has(code)) valid[code] = qty;
    }
    const count = Object.keys(valid).length;
    if (!count) {
      setFeedback('Nenhum código válido. Use: MEX 5, BRA: 13, CAN 3(2x)');
      setSaving(false);
      return;
    }
    await saveDuplicates(valid);
    setInput('');
    setFeedback(`✓ ${count} figurinha(s) marcada(s).`);
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
        <textarea
          className="trocas-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={"Pan: 9(2x), Bra: 13(1x), MEX 5..."}
          rows={4}
        />
        {feedback && <p className="trocas-feedback">{feedback}</p>}
        <button className="trocas-primary-btn" onClick={markDuplicates} disabled={saving || !input.trim()}>
          {saving ? 'Salvando...' : '📌 Marcar como repetidas'}
        </button>
      </section>

      <section className="trocas-section">
        <div className="trocas-section-header">
          <h3>🔄 Minhas repetidas <span className="trocas-badge">{dupTotal} cópia(s) extra(s)</span></h3>
          {dupTotal > 0 && <button className="trocas-danger-btn" onClick={clearDuplicates}>Zerar todas</button>}
        </div>
        {!dupTotal ? (
          <p className="trocas-empty">Nenhuma repetida cadastrada.</p>
        ) : (
          <>
            <div className="trocas-codes-display">
              {dupGroups.map(g => (
                <div key={g.key} className="trocas-group">
                  <span className="trocas-group-label">{g.flag} {g.label}:</span>
                  <span className="trocas-group-codes">
                    {g.codes.map(c => {
                      const n = c.replace(g.key, '');
                      const q = duplicates[c];
                      return <span key={c} className="trocas-code">{n}{q > 1 ? <sup>{q}x</sup> : ''}</span>;
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
          <h3>❓ Minhas faltantes <span className="trocas-badge">{missingCodes.length} figurinha(s)</span></h3>
        </div>
        {!missingCodes.length ? (
          <p className="trocas-empty">🎉 Álbum completo!</p>
        ) : (
          <>
            <div className="trocas-codes-display">
              {misGroups.map(g => (
                <div key={g.key} className="trocas-group">
                  <span className="trocas-group-label">{g.flag} {g.label}:</span>
                  <span className="trocas-group-codes">
                    {g.codes.map(c => (
                      <span key={c} className="trocas-code">{c.replace(g.key, '')}</span>
                    ))}
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
  const [mode, setMode] = useState('pegar');
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

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
    const body = groupByTeam(result, data)
      .map(g => `${g.flag} ${g.label.toUpperCase()}\n${g.key}: ${g.codes.map(c => c.replace(g.key, '')).join(' · ')}`)
      .join('\n\n');
    navigator.clipboard.writeText(`${header}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const resultGroups = result ? groupByTeam(result, data) : [];

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

      <section className="trocas-section">
        <p className="trocas-hint">
          {mode === 'pegar'
            ? 'Cole as figurinhas REPETIDAS da outra pessoa. O app mostra quais dessas você ainda precisa.'
            : 'Cole as figurinhas que FALTAM para a outra pessoa. O app mostra quais você tem de repetida para dar.'}
        </p>
        <p className="trocas-hint"><em>Formato:</em> FWC 1, MEX 5, BRA: 13, 14 ...</p>
        <textarea
          className="trocas-textarea"
          value={input}
          onChange={e => { setInput(e.target.value); setResult(null); }}
          rows={5}
          placeholder="FWC 1, MEX 5, BRA: 13, 14..."
        />
        <button className="trocas-primary-btn" onClick={compare} disabled={!input.trim()}>
          🔍 Comparar agora
        </button>
      </section>

      {result !== null && (
        <section className="trocas-section">
          <div className="trocas-section-header">
            <h3>
              {result.length
                ? `${result.length} figurinha(s) ${mode === 'pegar' ? 'que você precisa' : 'que você pode dar'}:`
                : 'Nenhuma correspondência encontrada.'}
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
                  <span className="trocas-group-label">{g.flag} {g.label}:</span>
                  <span className="trocas-group-codes">
                    {g.codes.map(c => (
                      <span key={c} className="trocas-code">{c.replace(g.key, '')}</span>
                    ))}
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
