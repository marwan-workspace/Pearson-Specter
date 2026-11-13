'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks';

/**
 * A figure that counts up once when `rollKey` changes (a new crew member, or the first paint) and then
 * simply shows the live value. Live updates never animate, so a changing reading stays steady to read.
 * Works on "98", "36.8" and "124/78": every number in the text rolls, everything else is left alone.
 */
export function Rolling({ text, rollKey, duration = 650 }: { text: string; rollKey: string; duration?: number }) {
  const still = useReducedMotion();
  const [progress, setProgress] = useState(1);
  const raf = useRef(0);

  useEffect(() => {
    if (still) {
      setProgress(1);
      return;
    }
    const start = performance.now();
    setProgress(0);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setProgress(1 - Math.pow(1 - p, 3)); // ease-out cubic
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [rollKey, still, duration]);

  if (progress >= 1) return <>{text}</>;
  const shown = text.replace(/\d+(\.\d+)?/g, (n) => {
    const decimals = n.includes('.') ? n.split('.')[1].length : 0;
    return (Number(n) * progress).toFixed(decimals);
  });
  // The real value stays in the accessibility tree while the visible one rolls.
  return (
    <>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
