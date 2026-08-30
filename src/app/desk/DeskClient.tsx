'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MATCH_CONFIDENCE_THRESHOLD, matchDestination } from '@/lib/catalog';
import { speechAvailable, startListening, type SpeechRecognitionLike } from './speech';

interface DestinationOption {
  id: string;
  origin: string;
  destination: string;
}

interface CreatedPass {
  publicId: string;
  url: string;
  qrDataUrl: string;
  origin: string;
  destination: string;
  steps: string[];
  expiresAt: number;
}

interface LookupResult {
  publicId: string;
  origin: string;
  destination: string;
  steps: string[];
  expiresAt: number;
}

export default function DeskClient({ destinations }: { destinations: DestinationOption[] }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">CarePath — Reception Desk</h1>
        <p className="mt-1 text-[color:var(--color-muted)]">
          Create a temporary walking route for a visitor, or look one up by its ID.
        </p>
      </header>
      <CreatePanel destinations={destinations} />
      <LookupPanel />
    </div>
  );
}

// --- Create ----------------------------------------------------------------

function CreatePanel({ destinations }: { destinations: DestinationOption[] }) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pass, setPass] = useState<CreatedPass | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setMicSupported(speechAvailable());
    return () => recognitionRef.current?.abort();
  }, []);

  // Speech and typing feed the same matcher; neither ever picks on its own.
  const searchText = transcript || query;
  const matches = useMemo(() => (searchText ? matchDestination(searchText).slice(0, 4) : []), [searchText]);
  const best = matches[0];
  const confident = best && best.score >= MATCH_CONFIDENCE_THRESHOLD;

  const selected = destinations.find((d) => d.id === selectedId) ?? null;

  function handleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    setSpeechError(null);
    setTranscript('');
    setSelectedId('');
    setPass(null);
    setListening(true);
    recognitionRef.current = startListening({
      onTranscript: (text, isFinal) => {
        setTranscript(text);
        // Pre-fill the confirmation, but leave the receptionist to confirm it.
        if (isFinal) {
          const top = matchDestination(text)[0];
          if (top && top.score >= MATCH_CONFIDENCE_THRESHOLD) setSelectedId(top.route.id);
        }
      },
      onError: (message) => {
        setSpeechError(message);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
  }

  async function create() {
    if (!selectedId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId: selectedId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not create the CarePath.');
      setPass(data as CreatedPass);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create the CarePath.');
    } finally {
      setCreating(false);
    }
  }

  function reset() {
    setPass(null);
    setTranscript('');
    setQuery('');
    setSelectedId('');
    setCreateError(null);
    setSpeechError(null);
  }

  if (pass) return <PassCreated pass={pass} onReset={reset} />;

  return (
    <section className="rounded-xl border border-[color:var(--color-line)] p-6">
      <h2 className="text-xl font-semibold">1. Choose the destination</h2>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleMic}
          disabled={!micSupported}
          aria-pressed={listening}
          className={`rounded-lg px-6 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-[color:var(--color-muted)] ${
            listening ? 'bg-[color:var(--color-alert)]' : 'bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-dark)]'
          }`}
        >
          {listening ? 'Stop listening' : 'Speak the destination'}
        </button>
        {!micSupported && (
          <p className="text-sm text-[color:var(--color-muted)]">
            Speech is unavailable in this browser. Use the search box.
          </p>
        )}
        {listening && <p aria-live="polite">Listening…</p>}
      </div>

      {transcript && (
        <p className="mt-4 rounded-lg bg-[color:var(--color-panel)] p-3" aria-live="polite">
          Heard: <strong>{transcript}</strong>
        </p>
      )}
      {speechError && (
        <p className="mt-4 rounded-lg bg-[color:var(--color-alert-tint)] p-3 text-[color:var(--color-alert)]" role="alert">
          {speechError}
        </p>
      )}

      <label className="mt-6 block">
        <span className="font-medium">Search approved destinations</span>
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setTranscript('');
          }}
          placeholder="e.g. imaging, lab, cardiology"
          className="mt-1 w-full rounded-lg border border-[color:var(--color-line)] px-4 py-3 text-lg"
        />
      </label>

      {searchText && !confident && (
        <p className="mt-3 text-[color:var(--color-muted)]">
          No confident match. Pick the destination from the list below.
        </p>
      )}

      {matches.length > 0 && (
        <ul className="mt-3 space-y-2">
          {matches.map((match) => (
            <li key={match.route.id}>
              <button
                type="button"
                onClick={() => setSelectedId(match.route.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-lg ${
                  selectedId === match.route.id
                    ? 'border-[color:var(--color-brand)] bg-[color:var(--color-panel)] font-semibold'
                    : 'border-[color:var(--color-line)]'
                }`}
              >
                {match.route.destination}
                <span className="block text-sm text-[color:var(--color-muted)]">from {match.route.origin}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-6 block">
        <span className="font-medium">Or choose from all approved destinations</span>
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="mt-1 w-full rounded-lg border border-[color:var(--color-line)] px-4 py-3 text-lg"
        >
          <option value="">Select a destination…</option>
          {destinations.map((option) => (
            <option key={option.id} value={option.id}>
              {option.destination} (from {option.origin})
            </option>
          ))}
        </select>
      </label>

      <h2 className="mt-8 text-xl font-semibold">2. Confirm and create</h2>
      <p className="mt-2 text-lg" aria-live="polite">
        {selected ? (
          <>
            Destination: <strong>{selected.destination}</strong>, starting from <strong>{selected.origin}</strong>.
          </>
        ) : (
          <span className="text-[color:var(--color-muted)]">No destination selected yet.</span>
        )}
      </p>

      {createError && (
        <p className="mt-3 rounded-lg bg-[color:var(--color-alert-tint)] p-3 text-[color:var(--color-alert)]" role="alert">
          {createError}
        </p>
      )}

      <button
        type="button"
        onClick={create}
        disabled={!selectedId || creating}
        className="mt-4 rounded-lg bg-[color:var(--color-brand)] px-6 py-4 text-lg font-semibold text-white hover:bg-[color:var(--color-brand-dark)] disabled:cursor-not-allowed disabled:bg-[color:var(--color-muted)]"
      >
        {creating ? 'Creating…' : 'Create CarePath'}
      </button>
    </section>
  );
}

function PassCreated({ pass, onReset }: { pass: CreatedPass; onReset: () => void }) {
  return (
    <section className="rounded-xl border border-[color:var(--color-line)] p-6">
      <h2 className="text-xl font-semibold">Ask the visitor to scan this</h2>
      <p className="mt-1 text-[color:var(--color-muted)]">
        Directions to {pass.destination}, from {pass.origin}.
      </p>

      {/* Plain <img>: the QR is a runtime data URL, not a build-time asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pass.qrDataUrl}
        alt={`QR code opening the CarePath for ${pass.destination}`}
        className="mt-4 h-64 w-64 rounded-lg border border-[color:var(--color-line)]"
      />

      <p className="mt-6 text-lg">If they cannot scan it, give them this CarePath ID:</p>
      <p className="mt-1 text-5xl font-bold tracking-wider">{pass.publicId}</p>

      <p className="mt-4 text-[color:var(--color-muted)]">
        Expires {new Date(pass.expiresAt).toLocaleString()} (eight hours from now).
      </p>

      <ol className="mt-6 list-decimal space-y-1 pl-6">
        {pass.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onReset}
        className="mt-8 rounded-lg bg-[color:var(--color-brand)] px-6 py-4 text-lg font-semibold text-white hover:bg-[color:var(--color-brand-dark)]"
      >
        Create another CarePath
      </button>
    </section>
  );
}

// --- Lookup ----------------------------------------------------------------

function LookupPanel() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/passes/${encodeURIComponent(input.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Lookup failed.');
      setResult(data as LookupResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-[color:var(--color-line)] p-6">
      <h2 className="text-xl font-semibold">Look up a CarePath</h2>
      <p className="mt-1 text-[color:var(--color-muted)]">
        When a visitor calls, enter the ID they read out, for example RP-4821.
      </p>

      <form onSubmit={lookup} className="mt-4 flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="sr-only">CarePath ID</span>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="RP-4821"
            className="w-full rounded-lg border border-[color:var(--color-line)] px-4 py-3 text-lg"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-[color:var(--color-brand)] px-6 py-3 text-lg font-semibold text-white hover:bg-[color:var(--color-brand-dark)] disabled:cursor-not-allowed disabled:bg-[color:var(--color-muted)]"
        >
          {loading ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-[color:var(--color-alert-tint)] p-3 text-[color:var(--color-alert)]" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6" aria-live="polite">
          <p className="text-lg">
            <strong>{result.publicId}</strong> — {result.origin} to {result.destination}
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-6">
            {result.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-3 text-[color:var(--color-muted)]">
            Expires {new Date(result.expiresAt).toLocaleString()}.
          </p>
        </div>
      )}
    </section>
  );
}
