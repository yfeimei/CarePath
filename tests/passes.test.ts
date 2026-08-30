import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryPassStore } from '@/lib/store/memory';
import type { PassStore, RoutePass } from '@/lib/store';
import { PASS_TTL_MS, allocatePublicId, generateSecureToken, isExpired, normalizePublicId } from '@/lib/passes';

function makePass(overrides: Partial<RoutePass> = {}): RoutePass {
  const createdAt = Date.now();
  return {
    secureToken: generateSecureToken(),
    publicId: 'RP-1234',
    routeId: 'lobby-imaging',
    origin: 'Main Lobby',
    destination: 'Imaging',
    steps: ['Walk past the Information Desk.'],
    landmarks: ['Information Desk'],
    createdAt,
    expiresAt: createdAt + PASS_TTL_MS,
    ...overrides,
  };
}

describe('secure tokens', () => {
  it('are long and unguessable', () => {
    const token = generateSecureToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('do not repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateSecureToken));
    expect(tokens.size).toBe(500);
  });
});

describe('public ids', () => {
  it('normalizes what a receptionist might type off a phone call', () => {
    for (const input of ['RP-4821', 'rp 4821', '4821', 'RP4821']) {
      expect(normalizePublicId(input), input).toBe('RP-4821');
    }
  });

  it('rejects lengths outside the id format', () => {
    expect(normalizePublicId('12')).toBeNull();
    expect(normalizePublicId('1234567')).toBeNull();
    expect(normalizePublicId('no digits')).toBeNull();
  });

  it('never reissues an id that is already taken', async () => {
    // Exhaust the 4-digit space so allocation is forced to widen rather than
    // hand back an id pointing at somebody else's pass.
    const taken = new Set(Array.from({ length: 9000 }, (_, i) => `RP-${1000 + i}`));
    const store = { hasPublicId: async (id: string) => taken.has(id) } as PassStore;

    const id = await allocatePublicId(store);
    expect(taken.has(id)).toBe(false);
    expect(id).toMatch(/^RP-\d{5}$/);
  });
});

describe('expiry', () => {
  const createdAt = 1_700_000_000_000;
  const pass = makePass({ createdAt, expiresAt: createdAt + PASS_TTL_MS });

  it('is exactly eight hours', () => {
    expect(PASS_TTL_MS).toBe(8 * 60 * 60 * 1000);
  });

  it('is live one minute before expiry', () => {
    expect(isExpired(pass, createdAt + PASS_TTL_MS - 60_000)).toBe(false);
  });

  it('is expired at the boundary and after', () => {
    expect(isExpired(pass, createdAt + PASS_TTL_MS)).toBe(true);
    expect(isExpired(pass, createdAt + PASS_TTL_MS + 60_000)).toBe(true);
  });
});

describe('memory store', () => {
  let store: MemoryPassStore;

  beforeEach(() => {
    store = new MemoryPassStore(0);
  });

  it('reads a live pass back by token and by public id', async () => {
    const pass = makePass();
    await store.put(pass);
    expect(await store.getByToken(pass.secureToken)).toEqual(pass);
    expect(await store.getByPublicId(pass.publicId)).toEqual(pass);
  });

  it('returns null for an unknown token', async () => {
    expect(await store.getByToken(generateSecureToken())).toBeNull();
  });

  it('refuses an expired pass on read, without waiting for a sweep', async () => {
    const createdAt = Date.now() - PASS_TTL_MS - 1000;
    const pass = makePass({ createdAt, expiresAt: createdAt + PASS_TTL_MS });
    await store.put(pass);

    expect(await store.getByToken(pass.secureToken)).toBeNull();
    expect(await store.getByPublicId(pass.publicId)).toBeNull();
  });

  it('keeps an expired id reserved so it cannot be handed out again', async () => {
    const createdAt = Date.now() - PASS_TTL_MS - 1000;
    await store.put(makePass({ publicId: 'RP-5555', createdAt, expiresAt: createdAt + PASS_TTL_MS }));
    expect(await store.hasPublicId('RP-5555')).toBe(true);
  });
});
