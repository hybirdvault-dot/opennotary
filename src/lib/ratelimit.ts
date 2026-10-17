/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Pure and synchronous: state lives in a module-level `Map` keyed by caller
 * string, so limits are per-process and reset on redeploy. Suitable for
 * single-instance API routes and client-side throttling.
 */

/**
 * Request timestamps (epoch ms) currently counted per key.
 */
const windows = new Map<string, number[]>();

/**
 * Counts one request against `key` under a sliding-window limit.
 *
 * @param key - Caller identity to limit (e.g. IP or wallet address).
 * @param opts - Optional `limit` (default 10) and `windowMs` (default 60 000).
 * @returns `success` when the request fits the window; `remaining` slots left
 * afterwards (0 when rejected); `reset` = epoch ms when the oldest counted
 * request expires and the window frees capacity.
 */
export function rateLimit(
  key: string,
  opts?: { limit?: number; windowMs?: number },
): { success: boolean; remaining: number; reset: number } {
  const limit = opts?.limit ?? 10;
  const windowMs = opts?.windowMs ?? 60_000;
  const now = Date.now();

  const timestamps = (windows.get(key) ?? []).filter((at) => at + windowMs > now);
  const reset = (timestamps[0] ?? now) + windowMs;

  if (timestamps.length >= limit) {
    windows.set(key, timestamps);
    return { success: false, remaining: 0, reset };
  }

  timestamps.push(now);
  windows.set(key, timestamps);
  return { success: true, remaining: limit - timestamps.length, reset };
}
