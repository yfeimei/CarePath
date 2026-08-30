import { randomBytes, randomInt } from 'node:crypto';
import { getRoute } from './catalog';
import { getPassStore } from './store';
import type { PassStore, RoutePass } from './store';

/** Route passes expire automatically after eight hours. */
export const PASS_TTL_MS = 8 * 60 * 60 * 1000;

const PUBLIC_ID_ATTEMPTS = 25;

export function generateSecureToken(): string {
  return randomBytes(32).toString('base64url');
}

function candidatePublicId(digits: number): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return `RP-${randomInt(min, max)}`;
}

/**
 * Short ids are for reading aloud, so they're small — which means collisions.
 * Retry within the 4-digit space, then widen rather than ever handing back an
 * id that already points at somebody else's pass.
 */
export async function allocatePublicId(store: PassStore): Promise<string> {
  for (let i = 0; i < PUBLIC_ID_ATTEMPTS; i++) {
    const id = candidatePublicId(4);
    if (!(await store.hasPublicId(id))) return id;
  }
  for (let i = 0; i < PUBLIC_ID_ATTEMPTS; i++) {
    const id = candidatePublicId(5);
    if (!(await store.hasPublicId(id))) return id;
  }
  throw new Error('Could not allocate a free CarePath ID');
}

export const PUBLIC_ID_PATTERN = /^RP-\d{4,5}$/;

/** Accepts "rp 4821", "4821", "RP-4821" — receptionists type it off a phone call. */
export function normalizePublicId(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 5) return null;
  return `RP-${digits}`;
}

export async function createPass(routeId: string, now = Date.now()): Promise<RoutePass> {
  const route = getRoute(routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);

  const store = getPassStore();
  const pass: RoutePass = {
    secureToken: generateSecureToken(),
    publicId: await allocatePublicId(store),
    routeId: route.id,
    origin: route.origin,
    destination: route.destination,
    // Snapshot: editing the catalog must not rewrite directions a visitor is
    // already walking.
    steps: [...route.steps],
    landmarks: [...route.landmarks],
    createdAt: now,
    expiresAt: now + PASS_TTL_MS,
  };
  await store.put(pass);
  return pass;
}

export async function getPassByToken(token: string): Promise<RoutePass | null> {
  if (!token || token.length < 16) return null;
  return getPassStore().getByToken(token);
}

export async function getPassByPublicId(publicId: string): Promise<RoutePass | null> {
  if (!PUBLIC_ID_PATTERN.test(publicId)) return null;
  return getPassStore().getByPublicId(publicId);
}

export function isExpired(pass: RoutePass, now = Date.now()): boolean {
  return now >= pass.expiresAt;
}

export function formatExpiry(expiresAt: number): string {
  return new Date(expiresAt).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
