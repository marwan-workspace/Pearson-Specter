'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { TelemetryEngine, type Snapshot } from './telemetry';

/** One engine per mounted record page. It runs while the page is mounted and stops when it leaves. */
export function useTelemetryEngine() {
  const [engine] = useState(() => new TelemetryEngine());
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);
  return engine;
}

/** The engine's state at the last 1 Hz tick. Anything that draws every frame calls engine.sample() instead. */
export function useTelemetry(engine: TelemetryEngine): Snapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}
