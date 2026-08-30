# Contributing

## Getting set up

Node 20 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 64 unit tests
npm run typecheck
npm run build
```

No API key, database, or configuration is needed. CI runs typecheck, tests, and
build on every push and pull request.

## Adding or changing a route

`data/routes.json` is the source of truth. A route needs an `id`, `origin`,
`destination`, `aliases`, `steps`, and `landmarks`.

Two things are easy to get wrong:

- **Landmarks must appear in the steps that reference them**, in the same
  wording. The lost-help post-filter checks a reply against this text, and the
  rules provider finds the next step by locating the landmark inside it. A
  landmark spelled differently in the two places will silently stop working.
- **Write the steps in proper English, with articles.** The assistant reads the
  article back out of the step text — "the Information Desk" but "Elevator B" —
  rather than guessing.

`npm test` validates the schema, checks for duplicate ids, and asserts that
every destination and every alias matches confidently. Add aliases for whatever
a receptionist would actually say out loud.

Real-world routes need staff verification before deployment. See
[`NOTICE.md`](NOTICE.md).

## Touching the assistant

`src/lib/assist/` is the part where mistakes have consequences. It has three
layers, and a change to any of them wants a test:

- `guard.ts` — decides what is even allowed to reach a provider.
- `rules.ts` / `claude.ts` — produce a candidate instruction.
- `postfilter.ts` — decides whether a candidate may be shown.

Two rules worth stating explicitly:

1. **Every path that isn't a confidently grounded instruction must end at the
   front-desk fallback.** Provider errors, empty replies, refusals, timeouts —
   all of them. A visitor should never see a spinner or a stack trace.
2. **Never log a visitor's message or a provider's reply**, in any branch,
   including error handling. Messages are transient by design.

When you add a filter pattern, add both a case it should catch and a case it
should *not* — the guard has previously refused visitors for correctly naming
their own destination, and only a paired test catches that class of bug.

## Regenerating the documentation screenshots

The images in `docs/img/` are real screenshots of the running app, not mockups.
Playwright is intentionally not a dependency; install it only when refreshing
them:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install -D playwright --no-save
npm run build
PORT=3111 npm start &
node scripts/screenshots.mjs
```

It drives the installed Microsoft Edge rather than downloading a browser.

## Pull requests

Keep `npm run typecheck`, `npm test`, and `npm run build` green. Describe what
you changed and why; if it touches the assistant or the route catalog, say what
you tested by hand.
