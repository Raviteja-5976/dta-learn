/**
 * Fan-out of console output. Chunks emitted before the terminal subscribes
 * are kept (up to 4096) and replayed to the first subscriber, so the boot
 * banner and first prompt are never lost.
 */
export class OutputHub {
  private subscribers = new Set<(data: Uint8Array) => void>();
  private backlog: Uint8Array[] = [];
  private firstWaiters: Array<() => void> = [];
  private seenFirst = false;
  static readonly MAX_BACKLOG = 4096;

  emit(chunk: Uint8Array): void {
    if (!this.seenFirst) {
      this.seenFirst = true;
      for (const w of this.firstWaiters.splice(0)) w();
    }
    if (this.subscribers.size === 0) {
      if (this.backlog.length < OutputHub.MAX_BACKLOG) this.backlog.push(chunk);
      return;
    }
    for (const s of this.subscribers) s(chunk);
  }

  subscribe(cb: (data: Uint8Array) => void): () => void {
    this.subscribers.add(cb);
    if (this.backlog.length) {
      const pending = this.backlog.splice(0);
      for (const chunk of pending) cb(chunk);
    }
    return () => this.subscribers.delete(cb);
  }

  /** Resolves when the first output arrives, rejects after timeoutMs. */
  waitForFirst(timeoutMs: number): Promise<void> {
    if (this.seenFirst) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The shell did not start in time")), timeoutMs);
      this.firstWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  clear(): void {
    this.subscribers.clear();
    this.backlog = [];
    this.firstWaiters = [];
  }
}
