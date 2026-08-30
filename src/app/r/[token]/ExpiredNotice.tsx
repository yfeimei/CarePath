import { FRONT_DESK_DISPLAY, FRONT_DESK_TEL } from '@/lib/contact';

/**
 * Shown for an expired, unknown, or malformed token. Deliberately identical in
 * all three cases: it tells a visitor what to do without telling a guesser
 * whether a token was ever real.
 */
export default function ExpiredNotice() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-3xl font-bold tracking-tight">This CarePath is no longer active</h1>
      <p className="mt-4 text-xl">
        CarePath directions last eight hours. Please ask at the front desk for new directions.
      </p>
      <a
        href={`tel:${FRONT_DESK_TEL}`}
        className="mt-8 inline-block rounded-lg bg-[color:var(--color-brand)] px-6 py-4 text-xl font-semibold text-white"
      >
        Call the front desk
      </a>
      <p className="mt-3 text-[color:var(--color-muted)]">{FRONT_DESK_DISPLAY}</p>
    </main>
  );
}
