'use client';
import { useState, useMemo } from 'react';
import HistEntry from './HistEntry';

export default function HistoryDrawer({ history, data, onClose, onUndo }) {
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

  const firstUndoableId = useMemo(
    () => history.find(e => !e.isUndo && e.type !== 'reset_owned' && e.type !== 'reset_dups')?.id,
    [history]
  );

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
