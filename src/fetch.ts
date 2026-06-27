import axios from 'axios';
import { logger } from './logger.js';

export type FetchOptions = {
  url: string;
  userAgent: string;
  timeoutMs: number;
};

/**
 * Perform an HTTP GET with exponential backoff retry.
 *
 * Retry strategy:
 * - **Up to 3 attempts** (initial + 2 retries).
 * - **Backoff**: 1 s, then 2 s (with ±25% jitter).
 * - **Only retries on transient failures**: 5xx server errors and
 *   network-level errors (timeout, DNS, ECONNRESET, etc.).  4xx client
 *   errors are passed through immediately since retrying won't help.
 *
 * Logs each retry attempt at `warn` level and the final outcome.
 */
export async function fetchWithRetry(options: FetchOptions): Promise<string> {
  const { url, userAgent, timeoutMs } = options;
  const maxAttempts = 3;
  const delaysMs = [1_000, 2_000]; // first retry after 1 s, second after 2 s

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: timeoutMs,
        maxRedirects: 5,
      });
      return String(response.data);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 4xx client errors are not worth retrying
      if (axios.isAxiosError(err) && err.response && err.response.status < 500) {
        throw err;
      }

      if (attempt < maxAttempts) {
        const delayMs = delaysMs[attempt - 1] || 2_000;
        // Add ±25% jitter
        const jitter = delayMs * (0.75 + Math.random() * 0.5);
        logger.warn(
          'HTTP request failed (attempt %d/%d): %s — retrying in %d ms',
          attempt,
          maxAttempts,
          lastError.message,
          Math.round(jitter),
        );
        await sleep(jitter);
      }
    }
  }

  // All attempts exhausted
  logger.error('HTTP request failed after %d attempts: %s', maxAttempts, lastError!.message);
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
