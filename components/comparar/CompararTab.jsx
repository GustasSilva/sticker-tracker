'use client';
import { useState } from 'react';
import { parseStickersText, groupByTeam, codeNum, formatGroupLine } from '@/utils/stickers';
import { GroupFlag } from '@/components/ui/Flag';
import ImportPreview from '@/components/trocas/ImportPreview';

export default function CompararTab({ data, owned, duplicates, allCodes }) {
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
