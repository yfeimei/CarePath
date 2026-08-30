import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { z } from 'zod';
import { getRoute } from '@/lib/catalog';
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from '@/lib/limits';
import { createPass } from '@/lib/passes';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({ routeId: z.string().min(1) });

/**
 * The QR has to carry an absolute URL the visitor's phone can reach, which the
 * app can't know on its own behind a proxy. Set CAREPATH_PUBLIC_ORIGIN in
 * production; the header fallback is for local development.
 */
function publicOrigin(request: Request): string {
  const configured = process.env.CAREPATH_PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/+$/, '');

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const limit = rateLimit(`passes:create:${clientKey(request)}`, RATE_LIMITS.createPass, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A routeId is required.' }, { status: 400 });
  }

  if (!getRoute(parsed.data.routeId)) {
    return NextResponse.json({ error: 'That destination is not in the approved route list.' }, { status: 404 });
  }

  const pass = await createPass(parsed.data.routeId);
  const url = `${publicOrigin(request)}/r/${pass.secureToken}`;

  // The QR carries only the secure token, as the design specifies. It's rendered
  // server-side so the token reaches the receptionist's screen and nowhere else.
  const qrDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
    color: { dark: '#10171f', light: '#ffffff' },
  });

  return NextResponse.json({
    publicId: pass.publicId,
    url,
    qrDataUrl,
    origin: pass.origin,
    destination: pass.destination,
    steps: pass.steps,
    expiresAt: pass.expiresAt,
  });
}
