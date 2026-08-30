import { MemoryPassStore } from './memory';
import type { PassStore } from './types';

export type { PassStore, RoutePass } from './types';
export { MemoryPassStore } from './memory';

/**
 * Single store instance per process.
 *
 * Parked on globalThis so Next's dev-mode module reloading doesn't silently
 * discard every pass the receptionist just created.
 */
const globalForStore = globalThis as unknown as { __carePathStore?: PassStore };

export function getPassStore(): PassStore {
  if (!globalForStore.__carePathStore) {
    // Production swap point: `new RedisPassStore(process.env.REDIS_URL)`.
    globalForStore.__carePathStore = new MemoryPassStore();
  }
  return globalForStore.__carePathStore;
}
