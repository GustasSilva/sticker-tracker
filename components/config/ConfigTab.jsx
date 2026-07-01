'use client';
import { useState } from 'react';
import { parseStickersText } from '@/utils/stickers';
import ImportPreview from '@/components/trocas/ImportPreview';

export default function ConfigTab({ allCodes, owned, duplicates, importOwned, saveDuplicates, resetOwned, resetDuplicates, userEmail }) {
  const [ownedInput, setOwnedInput] = useState('');
  const [dupInput,   setDupInput]   = useState('');
  const [misInput,   setMisInput]   = useState('');
  const [busy, setBusy]  = useState('');
  const [msgs, setMsgs]  = useState({});
  const [confirm, setConfirm] = useState(null);

  const ownedCount = owned.size;
  const dupTotal   = Object.values(duplicates).reduce((s, q) => s + q, 0);

  function setMsg(k, v) { setMsgs(m => ({ ...m, [k]: v })); }

  async function handleReset() {
    const kind = confirm;
    setConfirm(null);
    setBusy('reset');
    if (kind === 'owned') {
      const n = await resetOwned();
      setMsg('reset', `✓ ${n} figurinha(s) desmarcada(s).`);
    } else {
      const n = await resetDuplicates();
      setMsg('reset', `✓ ${n} repetida(s) zerada(s).`);
    }
    setBusy('');
  }

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

      <div className="config-import-cols">
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
      </div>

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

      <section className="trocas-section config-danger">
        <h3>⚠️ Resetar coleção</h3>
        <p className="trocas-hint">Remove marcações de uma vez. Esta ação <strong>não pode ser desfeita</strong>.</p>
        {msgs.reset && <p className="trocas-feedback">{msgs.reset}</p>}
        <div className="config-reset-btns">
          <button className="trocas-danger-btn config-reset-btn" onClick={() => setConfirm('dups')}
            disabled={busy === 'reset' || dupTotal === 0}>
            🔄 Zerar repetidas{dupTotal > 0 ? ` (${dupTotal})` : ''}
          </button>
          <button className="trocas-danger-btn config-reset-btn" onClick={() => setConfirm('owned')}
            disabled={busy === 'reset' || ownedCount === 0}>
            🗑 Zerar marcadas{ownedCount > 0 ? ` (${ownedCount})` : ''}
          </button>
        </div>
      </section>

      {confirm && (
        <div className="undo-modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="undo-modal" onClick={e => e.stopPropagation()}>
            <p className="undo-modal-title">
              {confirm === 'owned' ? 'Zerar todas as marcadas?' : 'Zerar todas as repetidas?'}
            </p>
            <p className="undo-modal-note">
              {confirm === 'owned'
                ? `${ownedCount} figurinha(s) marcada(s) serão desmarcadas (repetidas incluídas). Não é possível desfazer.`
                : `${dupTotal} repetida(s) serão zeradas. As figurinhas continuam marcadas como coladas. Não é possível desfazer.`}
            </p>
            <div className="undo-modal-btns">
              <button className="undo-modal-cancel" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className="undo-modal-confirm" onClick={handleReset}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
