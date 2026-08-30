import type { PassStore, RoutePass } from './types';

/**
 * In-memory TTL store. Sufficient for the one-day prototype.
 *
 * Two caveats, both documented in the README:
 *  - single-instance only (a second replica sees none of these passes)
 *  - passes are lost on restart
 * Swap in a Redis-backed PassStore for production; nothing outside this file
 * knows how passes are stored.
 */
export class MemoryPassStore implements PassStore {
  private byToken = new Map<string, RoutePass>();
  private publicIdToToken = new Map<string, string>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(sweepIntervalMs = 5 * 60 * 1000) {
    if (sweepIntervalMs > 0) {
      this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
      // Don't hold the process open just to sweep an empty map.
      this.sweeper.unref?.();
    }
  }

  async put(pass: RoutePass): Promise<void> {
    this.byToken.set(pass.secureToken, pass);
    this.publicIdToToken.set(pass.publicId, pass.secureToken);
  }

  async getByToken(token: string): Promise<RoutePass | null> {
    return this.live(this.byToken.get(token));
  }

  async getByPublicId(publicId: string): Promise<RoutePass | null> {
    const token = this.publicIdToToken.get(publicId);
    if (!token) return null;
    return this.live(this.byToken.get(token));
  }

  async hasPublicId(publicId: string): Promise<boolean> {
    // Deliberately ignores expiry: an expired-but-not-yet-swept id is still
    // taken, and reusing it would let a caller reach the wrong pass.
    return this.publicIdToToken.has(publicId);
  }

  async size(): Promise<number> {
    this.sweep();
    return this.byToken.size;
  }

  /**
   * Expiry is enforced on read, not only by the sweeper — a pass that outlives
   * its expiresAt because the sweep hasn't run yet must still read as gone.
   */
  private live(pass: RoutePass | undefined): RoutePass | null {
    if (!pass) return null;
    if (Date.now() >= pass.expiresAt) {
      this.drop(pass);
      return null;
    }
    return pass;
  }

  private drop(pass: RoutePass) {
    this.byToken.delete(pass.secureToken);
    this.publicIdToToken.delete(pass.publicId);
  }

  private sweep() {
    const now = Date.now();
    for (const pass of this.byToken.values()) {
      if (now >= pass.expiresAt) this.drop(pass);
    }
  }

  /** Test helper. */
  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }
}
