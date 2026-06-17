'use client';
import { useMemo } from 'react';
import { parseStickersText } from '@/utils/stickers';

export default function ImportPreview({ text, allCodes, owned, duplicates, type }) {
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
