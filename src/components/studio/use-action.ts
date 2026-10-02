"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result<T> = { ok: true; data?: T } | { ok: false; error: string; errors?: string[] };

/** Run a server action, track pending/error state and refresh the route on success. */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function run<T>(fn: () => Promise<Result<T>>, opts?: { onSuccess?: (data: T | undefined) => void; refresh?: boolean }) {
    setError(null);
    setErrors([]);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          setError(res.error);
          setErrors(res.errors ?? []);
          return;
        }
        opts?.onSuccess?.(res.data);
        if (opts?.refresh !== false) router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return { run, pending, error, errors, setError };
}
