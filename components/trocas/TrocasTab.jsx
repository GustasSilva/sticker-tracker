'use client';
import { useState } from 'react';
import { parseStickersText, groupByTeam, codeNum, generateDupText, generateMissingText, teamSummary } from '@/utils/stickers';
import { GroupFlag } from '@/components/ui/Flag';
import PackBreakdown from './PackBreakdown';
import ImportPreview from './ImportPreview';

export default function TrocasTab({ data, owned, duplicates, missingCodes, allCodes, saveDuplicates, clearDuplicates, importOwned, pushHist }) {
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
