import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assist } from '@/lib/assist';
import { MAX_MESSAGE_LENGTH } from '@/lib/assist/guard';
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from '@/lib/limits';
import { getPassByToken } from '@/lib/passes';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const AssistSchema = z.object({
  token: z.string().min(16),
  message: z.string().max(MAX_MESSAGE_LENGTH * 4),
});

/**
 * Route-recovery help. Restricted to active, unexpired passes and rate-limited
 * per pass and per client.
 *
 * Nothing about the request or response is logged. The visitor's typed message
 * is transient: it exists for the life of this function call and is never
 * written anywhere.
 */
export async function POST(request: Request) {
  const clientLimit = rateLimit(
    `assist:client:${clientKey(request)}`,
    RATE_LIMITS.assistPerClient,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!clientLimit.ok) return tooMany(clientLimit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = AssistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const pass = await getPassByToken(parsed.data.token);
  if (!pass) {
    return NextResponse.json(
      { error: 'This CarePath is no longer active. Please ask at the front desk.' },
      { status: 404 },
    );
  }

  const passLimit = rateLimit(`assist:pass:${pass.publicId}`, RATE_LIMITS.assistPerPass, RATE_LIMIT_WINDOW_MS);
  if (!passLimit.ok) return tooMany(passLimit.retryAfterSeconds);

  const answer = await assist(
    {
      publicId: pass.publicId,
      origin: pass.origin,
      destination: pass.destination,
      steps: pass.steps,
      landmarks: pass.landmarks,
    },
    parsed.data.message,
  );

  return NextResponse.json(answer);
}

function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Too many messages. Please wait a moment, or call the front desk.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}
