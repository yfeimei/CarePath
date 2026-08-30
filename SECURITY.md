# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than opening a public
issue. Use GitHub's **Report a vulnerability** button under the repository's
Security tab, or contact the maintainers directly.

Please include what you were able to reach, how, and what it exposed. A working
proof of concept is welcome but not required.

## Known limitations — please don't report these

The items below are documented in [`NOTICE.md`](NOTICE.md) and the README. They
are accepted properties of a prototype, not undiscovered bugs:

- `GET /api/passes/<publicId>` is unauthenticated, and `RP-####` is a
  9,000-value space. It returns only origin, destination, approved steps, and
  expiry — no identifying data — and is rate-limited, but it is guessable by
  design at this stage.
- The pass store and rate limiter are in-process, so both are single-instance
  and reset on restart.
- Rate limiting trusts `x-forwarded-for`, which is only sound behind a trusted
  reverse proxy.
- HTTPS is not enforced at the application layer.

A report that one of these is exploitable *in a specific way we haven't
documented* is still welcome — it is the specifics that are useful.

## What is in scope

Anything that lets someone:

- read a pass they were not given, other than by guessing an `RP-####`;
- extract the `secureToken` for a pass from any surface other than the
  receptionist's own screen;
- get the lost-help assistant to emit directions that are not in the pass's
  approved route, or to answer a non-wayfinding question;
- get a message past the pre-filter that contains medical or personal
  information;
- cause the app to log, store, or transmit a visitor's typed message.

The last three are the interesting ones. The assistant's safety rests on a
guard, a constrained provider, and a post-filter — see the README. If you find a
phrasing that defeats all three, that is exactly the report worth sending.
