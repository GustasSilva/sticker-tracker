'use client';
import { useState } from 'react';
import useTrackerState from '@/hooks/useTrackerState';
import ColecaoTab from '@/components/colecao/ColecaoTab';
import TrocasTab from '@/components/trocas/TrocasTab';
import CompararTab from '@/components/comparar/CompararTab';
import ConfigTab from '@/components/config/ConfigTab';
import HistoryDrawer from '@/components/history/HistoryDrawer';

export default function Tracker({ data, userEmail }) {
  const {
    owned, duplicates, history, loading,
    allCodes, missingCodes, totalAll,
    pushHist, toggle, setCount, saveDuplicates, importOwned, clearDuplicates, executeUndo,
  } = useTrackerState(data);

  const [tab,         setTab]         = useState('colecao');
  const [historyOpen, setHistoryOpen] = useState(false);

  if (loading) return <div className="loading">Carregando coleção...</div>;

  const pct       = Math.round((owned.size / totalAll) * 100);
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

      {tab === 'colecao'  && <ColecaoTab  data={data} owned={owned} duplicates={duplicates} toggle={toggle} setCount={setCount} />}
      {tab === 'trocas'   && <TrocasTab   data={data} owned={owned} duplicates={duplicates} missingCodes={missingCodes} allCodes={allCodes} saveDuplicates={saveDuplicates} clearDuplicates={clearDuplicates} importOwned={importOwned} pushHist={pushHist} />}
      {tab === 'comparar' && <CompararTab data={data} owned={owned} duplicates={duplicates} allCodes={allCodes} />}
      {tab === 'config'   && <ConfigTab   allCodes={allCodes} owned={owned} duplicates={duplicates} importOwned={importOwned} saveDuplicates={saveDuplicates} userEmail={userEmail} />}

      <button className="history-fab" onClick={() => setHistoryOpen(true)} title="Histórico de alterações">
        🕐
      </button>

      {historyOpen && <HistoryDrawer history={history} data={data} onClose={() => setHistoryOpen(false)} onUndo={executeUndo} />}
    </div>
  );
}
