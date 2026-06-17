'use client';
import { useRef } from 'react';
import { PLAYER_NAMES } from '@/data/players';

export default function StickerBox({ code, owned, onToggle, foil, special, dupQty, teamColor, onLongPress }) {
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
  const tip    = [code, name && `· ${name}`, dupQty > 0 && `(${dupQty}x rep.)`].filter(Boolean).join(' ');

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
        <div className="sticker-center">
          {prefix && <span className="sticker-prefix">{prefix}</span>}
          <span className="sticker-num-big">{num}</span>
        </div>
        {dupQty > 0 && <span className="dup-corner">{dupQty}x</span>}
        {name && <span className="sticker-name">{name}</span>}
      </div>
    </div>
  );
}
