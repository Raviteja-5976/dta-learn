"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="bg-grid grid min-h-dvh place-items-center p-6">
      <div className="card-brut max-w-md p-10 text-center">
        <p className="font-mono text-5xl font-bold">exit 1</p>
        <h1 className="mt-3 font-display text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink/70">An unexpected error occurred. Try again, and if it keeps happening, let us know.</p>
        {error.digest && <p className="mt-2 font-mono text-[11px] text-ink/50">ref {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
          <a href="/" className="btn btn-secondary">Home</a>
        </div>
      </div>
    </div>
  );
}
