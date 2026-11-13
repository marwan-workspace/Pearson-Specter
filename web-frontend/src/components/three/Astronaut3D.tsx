'use client';

import dynamic from 'next/dynamic';
import type { Status } from '@/lib/types';

/** Client-only 3D astronaut (WebGL can’t render on the server). */
const Scene = dynamic(() => import('./AstronautScene'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-space-2" aria-hidden />,
});

export function Astronaut3D(props: { suitColor: string; visorTint: string; status: Status; heartRate: number; interactive?: boolean; stars?: boolean; label: string }) {
  const { label, ...rest } = props;
  return (
    <div className="h-full w-full" role="img" aria-label={label}>
      <Scene {...rest} />
    </div>
  );
}
