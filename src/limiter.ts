/**
 * Simple promise-based concurrency limiter.
 *
 * Limits how many concurrent operations are in-flight at any given time.
 * Defaults to 10 concurrent requests; configure with `MAX_CONCURRENCY` env var.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  private readonly max: number;

  constructor(max?: number) {
    this.max = max ?? (Number(process.env.MAX_CONCURRENCY) || 10);
  }

  /** Acquire a permit, waiting if at capacity. */
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  /** Release a permit, waking the next waiter if any. */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      // Transfer the slot directly to the next waiter — no net change in `active`
      next();
    } else {
      this.active--;
    }
  }

  /** Run `fn` under the concurrency limit. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/** Shared global instance used by fetchWithRetry. */
export const httpLimiter = new ConcurrencyLimiter();
