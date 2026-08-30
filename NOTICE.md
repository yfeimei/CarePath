# Notice

**CarePath is a prototype. It is not a medical device, and it is not fit for
clinical or patient-facing use without review.**

The MIT licence grants broad permission to reuse this code. It says nothing
about whether doing so is *safe* in your setting. This file is the part the
licence doesn't cover.

## Before this software is used by a real visitor

- **Every route in `data/routes.json` is invented.** All sixteen are plausible
  fiction written to exercise the app. Each route must be walked and signed off
  by facilities and front-desk staff before a visitor is sent along it. Wrong
  directions in a hospital are not a cosmetic bug: they delay appointments and
  strand people who are already unwell or anxious.
- **The front-desk telephone number is a placeholder** — 555-0100, from a range
  reserved for fiction. Every `tel:` link in the app dials it until you set
  `CAREPATH_FRONT_DESK_TEL`.
- **The pass-lookup endpoint is unauthenticated** and the `RP-####` identifier
  is a small guessable space. It exposes only non-identifying route data, but it
  must be placed behind staff authentication or network restriction.
- **Passes live in process memory.** They are lost on restart and invisible to a
  second replica. Use a shared TTL store.
- **HTTPS is not enforced in code.** Terminate TLS in front of the app.
- **Browser speech recognition may transmit audio to the browser vendor.** It is
  optional and never on the critical path, but the service must be approved
  before deployment.
- **Zero data retention is a property of the endpoint you configure**, not of
  this code. The app logs no prompts or responses, but if you enable the
  Claude-backed provider you must point it at an approved, zero-retention
  deployment.

## What this software deliberately does not do

It has no access to patient records, appointments, scheduling, or bed
management, and no ability to locate anyone. The lost-help assistant is
constrained to a single approved route and refuses everything else. Please keep
it that way: the safety argument for the assistant rests entirely on how little
it can reach.

## Emergencies

The assistant redirects any message suggesting a medical emergency to 911 and to
nearby staff. It is not a triage tool, an alerting system, or a substitute for
one, and it must never be presented to visitors as any of those.
