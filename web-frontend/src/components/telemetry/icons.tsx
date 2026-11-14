import type { CSSProperties } from 'react';

/** Animated instrument icons. All are decorative: the text beside each one carries the meaning. */
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** A heart that beats once every 60 / bpm seconds. */
export function HeartIcon({ bpm, className = 'size-4' }: { bpm: number; className?: string }) {
  const seconds = 60 / Math.min(220, Math.max(25, bpm || 60));
  return (
    <svg {...base} className={`icon-heart ${className}`} style={{ '--beat': `${seconds.toFixed(3)}s` } as CSSProperties}>
      <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}

/** Two lung lobes that fill and empty at the breathing rate. */
export function LungsIcon({ rpm, className = 'size-4' }: { rpm: number; className?: string }) {
  const seconds = 60 / Math.min(60, Math.max(4, rpm || 14));
  return (
    <svg {...base} className={`icon-lungs ${className}`} style={{ '--breath': `${seconds.toFixed(2)}s` } as CSSProperties}>
      <path d="M12 3v9" />
      <path className="lobe lobe-l" d="M12 9.5c-1.2 0-2.2.7-3 2C7 14.800 5.500 17 5.500 19.200c0 1 .7 1.700 1.700 1.500 2-.4 3.300-1.500 3.300-3.700V12" fill="currentColor" fillOpacity="0.2" />
      <path className="lobe lobe-r" d="M12 9.5c1.2 0 2.2.7 3 2 2 3.300 3.500 5.500 3.500 7.700 0 1-.7 1.700-1.700 1.500-2-.4-3.300-1.500-3.300-3.700V12" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

/** Sleep: a moon with a small body in orbit around it. */
export function OrbitSleepIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...base} className={`icon-orbit ${className}`}>
      <path d="M14.500 8.200a4.300 4.300 0 1 0 1.300 6.100 3.400 3.400 0 0 1-1.300-6.100Z" fill="currentColor" fillOpacity="0.25" />
      <g className="satellite"><circle cx="12" cy="2.600" r="1.100" fill="currentColor" stroke="none" /></g>
      <circle cx="12" cy="12" r="9.400" strokeOpacity="0.3" strokeDasharray="2 3" />
    </svg>
  );
}

/** A scanner reticle that turns while a scan is running. */
export function ReticleIcon({ active = true, className = 'size-4' }: { active?: boolean; className?: string }) {
  return (
    <svg {...base} className={`${active ? 'icon-reticle' : ''} ${className}`}>
      <circle cx="12" cy="12" r="8" strokeDasharray="10 6" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="1.500" fill="currentColor" stroke="none" />
    </svg>
  );
}
