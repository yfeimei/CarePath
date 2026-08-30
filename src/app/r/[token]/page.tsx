import Link from 'next/link';
import { formatExpiry, getPassByToken } from '@/lib/passes';
import { FRONT_DESK_TEL } from '@/lib/contact';
import ExpiredNotice from './ExpiredNotice';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your CarePath' };

export default async function RoutePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pass = await getPassByToken(token);

  if (!pass) return <ExpiredNotice />;

  return (
    // Bottom padding clears the fixed action bar.
    <main className="mx-auto max-w-xl px-5 pt-8 pb-32">
      <p className="text-[color:var(--color-muted)]">From {pass.origin}</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight">Directions to {pass.destination}</h1>

      {/* Every step is on screen at once — no paging, no JavaScript required. */}
      <ol className="mt-8 space-y-5">
        {pass.steps.map((step, index) => (
          <li key={step} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-brand)] text-lg font-bold text-white"
            >
              {index + 1}
            </span>
            <span className="pt-1 text-xl leading-snug">{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-10 rounded-lg bg-[color:var(--color-panel)] p-4 text-[color:var(--color-muted)]">
        <p>
          Your CarePath ID is <strong className="text-[color:var(--color-ink)]">{pass.publicId}</strong>. Read it out if
          you call the front desk.
        </p>
        <p className="mt-2">These directions expire at {formatExpiry(pass.expiresAt)}.</p>
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-[color:var(--color-line)] bg-[color:var(--color-page)] p-4">
        <div className="mx-auto flex max-w-xl gap-3">
          <Link
            href={`/r/${token}/lost`}
            className="flex-1 rounded-lg bg-[color:var(--color-brand)] px-6 py-4 text-center text-xl font-semibold text-white"
          >
            I&rsquo;m lost
          </Link>
          <a
            href={`tel:${FRONT_DESK_TEL}`}
            className="rounded-lg border-2 border-[color:var(--color-brand)] px-6 py-4 text-center text-xl font-semibold text-[color:var(--color-brand)]"
          >
            Call
          </a>
        </div>
      </nav>
    </main>
  );
}
