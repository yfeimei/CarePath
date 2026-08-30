'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { MAX_MESSAGE_LENGTH } from '@/lib/assist/guard';

interface Props {
  token: string;
  publicId: string;
  destination: string;
  frontDeskTel: string;
  frontDeskDisplay: string;
}

interface Turn {
  id: number;
  from: 'visitor' | 'carepath';
  text: string;
}

/**
 * Typed messages live in this component's state and nowhere else. They are not
 * persisted, not logged, and are gone when the page closes.
 */
export default function LostClient({ token, publicId, destination, frontDeskTel, frontDeskDisplay }: Props) {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);

  function append(from: Turn['from'], text: string) {
    setTurns((current) => [...current, { id: nextId.current++, from, text }]);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    append('visitor', message);
    setInput('');
    setBusy(true);

    try {
      const response = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, message }),
      });
      const data = await response.json();
      append(
        'carepath',
        response.ok
          ? data.reply
          : (data.error ?? `Something went wrong. Please call the front desk and give them your CarePath ID: ${publicId}.`),
      );
    } catch {
      append(
        'carepath',
        `I can't reach the network right now. Please call the front desk and give them your CarePath ID: ${publicId}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 pt-8 pb-40">
      <Link href={`/r/${token}`} className="text-[color:var(--color-brand)] underline">
        &larr; Back to my directions
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Where are you now?</h1>
      <p className="mt-2 text-xl">
        Tell me a sign, door, or landmark you can see, and I&rsquo;ll point you back to your route to {destination}.
      </p>

      <p className="mt-4 rounded-lg bg-[color:var(--color-panel)] p-3">
        Do not enter names or medical information. I can only help with directions.
      </p>

      {turns.length > 0 && (
        <div className="mt-6 space-y-4" aria-live="polite">
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={
                turn.from === 'visitor'
                  ? 'rounded-lg bg-[color:var(--color-panel)] p-4 text-lg'
                  : 'rounded-lg border-2 border-[color:var(--color-brand)] p-4 text-xl'
              }
            >
              <span className="block text-sm font-semibold text-[color:var(--color-muted)]">
                {turn.from === 'visitor' ? 'You said' : 'CarePath'}
              </span>
              {turn.text}
            </div>
          ))}
          {busy && <p className="text-[color:var(--color-muted)]">Thinking…</p>}
        </div>
      )}

      <form onSubmit={send} className="mt-6">
        <label className="block">
          <span className="font-medium">What can you see?</span>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="I am near Elevator B"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-[color:var(--color-line)] px-4 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="mt-3 w-full rounded-lg bg-[color:var(--color-brand)] px-6 py-4 text-xl font-semibold text-white disabled:cursor-not-allowed disabled:bg-[color:var(--color-muted)]"
        >
          {busy ? 'Sending…' : 'Ask'}
        </button>
      </form>

      <nav className="fixed inset-x-0 bottom-0 border-t border-[color:var(--color-line)] bg-[color:var(--color-page)] p-4">
        <div className="mx-auto max-w-xl">
          <a
            href={`tel:${frontDeskTel}`}
            className="block rounded-lg border-2 border-[color:var(--color-brand)] px-6 py-4 text-center text-xl font-semibold text-[color:var(--color-brand)]"
          >
            Call Front Desk &middot; {frontDeskDisplay}
          </a>
          <p className="mt-2 text-center text-[color:var(--color-muted)]">
            Give them your CarePath ID: <strong className="text-[color:var(--color-ink)]">{publicId}</strong>
          </p>
        </div>
      </nav>
    </main>
  );
}
