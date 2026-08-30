import { NextResponse } from 'next/server';
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from '@/lib/limits';
import { getPassByPublicId, normalizePublicId } from '@/lib/passes';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

/**
 * Front-desk lookup by the short CarePath ID.
 *
 * Returns only what the design permits: origin, destination, approved steps,
 * expiry. Never a name, phone number, appointment, or anything patient-related
 * — none of which this system ever stores.
 *
 * PROTOTYPE CAVEAT: unauthenticated, and RP-#### is a small guessable space.
 * The rate limit below is the only thing standing in front of it. Before real
 * deployment this needs staff authentication or network restriction. See README.
 */
export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const limit = rateLimit(`passes:lookup:${clientKey(request)}`, RATE_LIMITS.lookupPass, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many lookups. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const { publicId: raw } = await context.params;
  const publicId = normalizePublicId(decodeURIComponent(raw));
  if (!publicId) {
    return NextResponse.json({ error: 'That is not a valid CarePath ID.' }, { status: 400 });
  }

  const pass = await getPassByPublicId(publicId);
  if (!pass) {
    return NextResponse.json(
      { error: 'No active CarePath with that ID. It may have expired after eight hours.' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    publicId: pass.publicId,
    origin: pass.origin,
    destination: pass.destination,
    steps: pass.steps,
    expiresAt: pass.expiresAt,
  });
}
