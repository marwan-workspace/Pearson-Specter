'use client';

import { RotateCcw } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-10 max-w-xl p-6" role="alert">
      <h1 className="display text-2xl">This screen stopped working</h1>
      <p className="mt-2 text-text-2">The crew data is safe. Reload the screen to carry on. If it happens again, reset the demo data from the Simulator in the header.</p>
      {error.message && <p className="label num mt-3 break-words">{error.message}</p>}
      <button className="btn btn-primary mt-5" onClick={reset}>
        <RotateCcw className="size-4" aria-hidden /> Reload this screen
      </button>
    </div>
  );
}
