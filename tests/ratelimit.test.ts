import { beforeEach, describe, expect, it } from 'vitest';
import { clientKey, rateLimit, resetRateLimits } from '@/lib/ratelimit';

describe('rate limiter', () => {
  beforeEach(resetRateLimits);

  it('allows up to the limit and then blocks', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('k', 3, 60_000, now).ok, `request ${i + 1}`).toBe(true);
    }
    const blocked = rateLimit('k', 3, 60_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('opens a fresh window once the old one passes', () => {
    const now = 1_000_000;
    rateLimit('k', 1, 60_000, now);
    expect(rateLimit('k', 1, 60_000, now).ok).toBe(false);
    expect(rateLimit('k', 1, 60_000, now + 60_001).ok).toBe(true);
  });

  it('keeps separate keys independent', () => {
    const now = 1_000_000;
    rateLimit('a', 1, 60_000, now);
    expect(rateLimit('a', 1, 60_000, now).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000, now).ok).toBe(true);
  });

  it('takes the first hop from a forwarded-for chain', () => {
    const request = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    });
    expect(clientKey(request)).toBe('203.0.113.5');
  });

  it('falls back to a constant when no client header is present', () => {
    expect(clientKey(new Request('http://localhost/'))).toBe('unknown');
  });
});
