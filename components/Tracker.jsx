'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Tracker({ data, userEmail }) {
  const supabase = useMemo(() => createClient(), []);
  const [owned, setOwned] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: rows, error } = await supabase
        .from('user_progress')
        .select('sticker_code, owned')
        .eq('owned', true);
      if (!active) return;
      if (!error && rows) {
        setOwned(new Set(rows.map((r) => r.sticker_code)));
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [supabase]);

  async function toggle(code) {
    const next = new Set(owned);
    const isOwned = next.has(code);
    if (isOwned) {
      next.delete(code);
    } else {
      next.add(code);
    }
    setOwned(next);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;

    await supabase
      .from('user_progress')
      .upsert(
        { user_id: userId, sticker_code: code, owned: !isOwned, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,sticker_code' }
      );
  }

  const totalAll = useMemo(
    () =>
      data.teams.reduce((acc, t) => acc + t.stickers.length, 0) +
      data.specials.length +
      data.coke.length,
    [data]
  );
  const ownedAll = owned.size;

  if (loading) {
    return <div className="loading">Carregando coleção...</div>;
  }

  return (
    <div>
      <h1>⚽ Panini FIFA World Cup 2026</h1>
      <div id="summary">
        {ownedAll}/{totalAll} figurinhas ({Math.round((ownedAll / totalAll) * 100)}%) — {userEmail}
        {' · '}
        <form action="/logout" method="post" style={{ display: 'inline' }}>
          <button type="submit" className="link-btn">Sair</button>
        </form>
      </div>
      <div id="total-bar-wrap">
        <div id="total-bar" style={{ width: `${(ownedAll / totalAll) * 100}%` }} />
      </div>

      <div className="filter-bar">
        {[
          ['all', 'Todas'],
          ['incomplete', 'Incompletas'],
          ['complete', 'Completas'],
          ['none', 'Vazias'],
        ].map(([mode, label]) => (
          <button
            key={mode}
            className={filter === mode ? 'active' : ''}
            onClick={() => setFilter(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid">
        <SpecialCard
          title="✦ Página Inicial / FIFA World Cup History"
          codes={data.specials}
          owned={owned}
          toggle={toggle}
          extraClass="intro-card"
          filter={filter}
        />
        <SpecialCard
          title="🥤 Coca-Cola Bonus Stickers"
          codes={data.coke}
          owned={owned}
          toggle={toggle}
          extraClass="coke-card coke-sticker"
          filter={filter}
        />
        {data.teams.map((team) => (
          <TeamCard
            key={team.code}
            team={team}
            owned={owned}
            toggle={toggle}
            filter={filter}
          />
        ))}
      </div>
    </div>
  );
}

function countOwned(codes, owned) {
  return codes.filter((c) => owned.has(c)).length;
}

function shouldShow(filter, n, total) {
  if (filter === 'incomplete') return n > 0 && n < total;
  if (filter === 'complete') return n === total;
  if (filter === 'none') return n === 0;
  return true;
}

function SpecialCard({ title, codes, owned, toggle, extraClass, filter }) {
  const n = countOwned(codes, owned);
  if (!shouldShow(filter, n, codes.length) && filter !== 'all') {
    // intro/coke cards sempre visíveis, como no exemplo original
  }
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
        {codes.map((code) => (
          <StickerBox key={code} code={code} label={code} owned={owned.has(code)} onToggle={() => toggle(code)} />
        ))}
      </div>
    </div>
  );
}

function TeamCard({ team, owned, toggle, filter }) {
  const n = countOwned(team.stickers, owned);
  const total = team.stickers.length;
  const complete = n === total;
  if (!shouldShow(filter, n, total)) return null;

  return (
    <div className={`team-card${complete ? ' team-complete' : ''}`}>
      <div className="team-header">
        <span className="team-name">{team.group} · {team.name}</span>
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
          />
        ))}
      </div>
    </div>
  );
}

function StickerBox({ code, label, owned, onToggle, foil }) {
  return (
    <label className={`sticker-label${foil ? ' foil-sticker' : ''}${owned ? ' is-checked' : ''}`}>
      <input type="checkbox" checked={owned} onChange={onToggle} />
      <div className="sticker-box" />
      <span className="sticker-num">{label}</span>
    </label>
  );
}
