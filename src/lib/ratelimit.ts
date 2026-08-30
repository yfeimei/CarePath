/**
 * Fixed-window rate limiter, in-process. Same single-instance caveat as the
 * pass store; front it with a shared limiter (Redis, or the reverse proxy) in
 * production.
 */

interface Window {
  count: number;
  resetAt: number;
}

const globalForLimiter = globalThis as unknown as { __carePathLimiter?: Map<string, Window> };

function buckets(): Map<string, Window> {
  if (!globalForLimiter.__carePathLimiter) globalForLimiter.__carePathLimiter = new Map();
  return globalForLimiter.__carePathLimiter;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const map = buckets();
  const existing = map.get(key);

  if (!existing || now >= existing.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    if (map.size > 10_000) sweep(map, now);
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

function sweep(map: Map<string, Window>, now: number) {
  for (const [key, win] of map) {
    if (now >= win.resetAt) map.delete(key);
  }
}

/**
 * Best-effort client identity for rate limiting. Trust the proxy headers only
 * because this is meant to sit behind the hospital's own reverse proxy; a
 * direct-to-internet deployment must not.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Test helper. */
export function resetRateLimits() {
  globalForLimiter.__carePathLimiter = new Map();
}
