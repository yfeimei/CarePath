# CarePath

Turns a receptionist's spoken directions into a temporary, phone-friendly route
for a hospital visitor. No download, login, patient lookup, location tracking,
or visitor profile.

Implementation of [`my-doc/carePath-design.txt`](my-doc/carePath-design.txt), at
the one-day prototype scope.

> **Prototype — not for clinical use.** Every route in this repository is
> invented, the front-desk number is fictional, and the lookup endpoint is
> unauthenticated. Read [`NOTICE.md`](NOTICE.md) before pointing this at anyone
> real.

**Illustrated walkthrough:** the [project site](docs/index.html) explains what
CarePath is and how it's used, with screenshots of the running app. It is served
from `docs/` by GitHub Pages.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No configuration is needed to run the demo. See `.env.example` for the settings
that matter in a real deployment.

```bash
npm test             # 64 unit tests, no server needed
npm run typecheck
npm run build
```

### The smoke test

`npm test` once passed 52/52 while the assembled app was broken on fourteen of
sixteen routes — the lost-help guard was refusing visitors for correctly naming
their own destination, and nothing was exercising the wired-up system. So there
is a second suite that talks to a running server over real HTTP:

```bash
npm run build
PORT=3111 npm start &
npm run smoke        # 253 checks: every route, every landmark, every boundary
```

It creates a pass for each of the sixteen routes, renders the visitor page,
asks the assistant about all seventy-six landmarks, checks the front-desk lookup
leaks no extra fields, and runs the adversarial cases. CI runs both suites.

## What's here

| URL | Who | What |
| --- | --- | --- |
| `/desk` | Receptionist | Speak or search for a destination, confirm it, create a CarePath, show the QR. Also looks up a pass by its `RP-####` ID. |
| `/r/<secure-token>` | Visitor | All approved steps at once, in large type, plus a fixed **I'm lost** bar. |
| `/r/<secure-token>/lost` | Visitor | Type a landmark, get one recovery instruction. **Call Front Desk** via `tel:`. |
| `POST /api/passes` | — | Create a pass. Returns the public ID, the URL, and the QR as a data URL. |
| `GET /api/passes/<publicId>` | Front desk | Origin, destination, steps, expiry. Nothing else. |
| `POST /api/assist` | Visitor page | Route recovery. Requires an active token; rate-limited. |

## How a route becomes a pass

`data/routes.json` is the source of truth. It's validated against a Zod schema
at load time, so a malformed route fails on startup rather than in front of a
visitor. Speech recognition only *chooses* an entry from it — the receptionist
always confirms, and the transcript can never produce a route.

Creating a pass **snapshots** the steps and landmarks onto the pass. Editing the
catalog therefore can't rewrite directions a visitor is already walking.

- `secureToken` — 32 random bytes, base64url. Appears only in the QR URL.
- `publicId` — `RP-` plus four digits, from `crypto.randomInt`, retried on
  collision and widened to five digits rather than ever reissuing a taken ID.
- `expiresAt` — `createdAt + 8h`. Checked on **read**, not just by the sweeper,
  so a stale entry can't serve an expired pass.

Passes live in an in-memory TTL store behind a `PassStore` interface
(`src/lib/store/`). Redis drops in behind the same three methods.

## The AI boundary

Three layers, because this is the part with real consequences:

1. **Pre-filter** (`src/lib/assist/guard.ts`) — runs *before* any provider is
   consulted, so out-of-scope text never leaves the server. Emergencies are
   checked first, then patient/relative references, medical questions,
   appointments and billing, phone numbers and emails, and finally anything with
   no spatial content at all. Each gets its own redirect.

   The subtle part is that these filters **collide with real destination
   names**. Hospitals have places called "Surgery Check-In", "Patient Billing
   Office", "Medical Records", and "Emergency Department" — a naive keyword
   filter refuses a visitor for naming the very place they were sent to, which
   broke lost-help on five of the sixteen routes. So a category match is ignored
   when every word of it is in *this pass's* approved text **and** it sits next
   to another approved word. "Patient Billing Office" is a place; "patient Jane
   Doe" is not, on the same route. Relationship words ("my mother") and
   unambiguous emergencies ("chest pain", "collapsed") are never excused.
2. **Provider** — `rules` (default) or `claude`, selected by
   `CAREPATH_ASSIST_PROVIDER`. The rules provider matches the message against
   this pass's approved landmarks and returns the next approved step; it has no
   network dependency and is structurally incapable of inventing a route. The
   Claude provider gets a system prompt containing *only* this pass's steps and
   landmarks and returns `{confident, instruction, landmarkUsed}` via structured
   outputs.
3. **Post-filter** (`src/lib/assist/postfilter.ts`) — the last line of defence.
   Rejects any reply that claims to know the visitor's location, keys off a
   landmark not on this pass, names a place (floor, elevator, department,
   colour, ordinal, number) absent from the approved text, or isn't grounded in
   the route at all.

Anything that fails at any layer returns the exact line the design specifies:

> I'm not certain where you are. Please call the front desk and give them your
> CarePath ID: RP-4821.

Typed messages are transient. They exist for the life of one request handler and
are never written to disk, a database, or a log.

## Known gaps

These are real and deliberate — a prototype, not a deployment.

- **`GET /api/passes/<publicId>` is unauthenticated**, and `RP-####` is a 9,000-
  value space. Rate limiting (20/min per client) is the only thing in front of
  it. It returns only non-identifying route data, which is all the design
  permits, but it needs staff authentication or network restriction before real
  use.
- **In-memory store and rate limiter are single-instance.** A second replica
  sees neither. Passes are lost on restart. Use Redis for both in production.
- **HTTPS is not enforced in code.** Terminate TLS at the hospital's proxy;
  `next.config.mjs` is the hook point if an app-level redirect is wanted.
- **Rate limiting trusts `x-forwarded-for`**, which is only safe behind the
  hospital's own reverse proxy.
- **Route data is invented.** All 16 routes in `data/routes.json` are
  placeholders. Every one needs walking and signing off by facilities and
  front-desk staff before a visitor sees it.
- **The front desk number is a placeholder** (555-0100, a reserved fictional
  number). Set `CAREPATH_FRONT_DESK_TEL`.
- **Browser speech may transmit audio to the browser vendor.** It is optional,
  feature-detected, and never on the critical path — manual selection is always
  on screen — but the hospital must approve the service before deployment.
- **Zero retention is a property of the endpoint, not of this code.** The app
  logs nothing, but if you enable the Claude provider you must point it at a
  hospital-approved, zero-retention deployment. One concrete note: the default
  model is `claude-opus-5`, which runs under zero data retention;
  `claude-fable-5` **requires 30-day retention** and would violate the design's
  requirement, so don't set `CAREPATH_ASSIST_MODEL` to it.

## Testing

`npm test` covers the catalog, matching, expiry boundaries, ID allocation, the
guard, and the post-filter. `npm run smoke` covers the assembled system over
HTTP. [`TESTING.md`](TESTING.md) has the manual checklist for the items in the
design that code can't cover — real-phone QR scanning, contrast, and poor
network.

## Repository layout

```
data/routes.json          the route catalog — the source of truth
src/lib/                  catalog, passes, store, rate limits, assist pipeline
src/app/                  /desk, /r/[token], and the three API routes
tests/                    unit tests (vitest)
scripts/smoke.mjs         end-to-end HTTP suite, no dependencies
scripts/screenshots.mjs   regenerates docs/img from the running app
docs/                     the GitHub Pages site
```

## Further reading

| File | What's in it |
| --- | --- |
| [`NOTICE.md`](NOTICE.md) | What must change before real use. Read this first. |
| [`TESTING.md`](TESTING.md) | Automated coverage plus the manual checklist. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Adding routes, touching the assistant, refreshing screenshots. |
| [`SECURITY.md`](SECURITY.md) | Reporting a vulnerability, and the known limitations that aren't ones. |

## License

MIT — see [`LICENSE`](LICENSE). The licence grants permission; it does not make
deployment safe. [`NOTICE.md`](NOTICE.md) covers the difference.
