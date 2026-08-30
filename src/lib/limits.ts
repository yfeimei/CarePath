/**
 * Rate limits, in requests per minute.
 *
 * Tunable by environment because the right numbers depend on deployment: a
 * single busy front desk behind one NAT looks very different from per-visitor
 * traffic. The defaults are sized for the prototype.
 */

function perMinute(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const RATE_LIMIT_WINDOW_MS = 60_000;

export const RATE_LIMITS = {
  /** Pass creation, per client. A desk creating one a second is already odd. */
  createPass: perMinute(process.env.CAREPATH_RATE_LIMIT_CREATE, 60),

  /** Front-desk lookup, per client. Low on purpose: RP-#### is guessable. */
  lookupPass: perMinute(process.env.CAREPATH_RATE_LIMIT_LOOKUP, 20),

  /** Lost-help, per client. */
  assistPerClient: perMinute(process.env.CAREPATH_RATE_LIMIT_ASSIST_CLIENT, 30),

  /** Lost-help, per pass. Bounds one visitor regardless of their network. */
  assistPerPass: perMinute(process.env.CAREPATH_RATE_LIMIT_ASSIST_PASS, 15),
} as const;
