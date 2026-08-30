# CarePath — test checklist

`npm test` covers everything below marked **automated**. The rest needs a human,
a real phone, and a real corridor.

## Automated (`npm test`, 64 tests)

- [x] **Every approved route** — the catalog loads, each route resolves by id, and
      every destination *and every alias* matches confidently.
- [x] **Incorrect speech transcription** — spoken filler is stripped
      ("directions to the lab", "take me to imaging"); a transcript with no
      confident match scores below the threshold so the desk page falls back to
      manual selection rather than guessing.
- [x] **Expired passes** — live at 7h59m, expired at exactly 8h and after;
      expiry enforced on read, not only by the sweeper; an expired public ID
      stays reserved so it can never be reissued to a different visitor.
- [x] **Unknown landmarks** — produce the front-desk fallback, never a guess.
- [x] **Out-of-scope AI questions** — patient, medical, appointments, billing,
      records, contact details, and unrelated chatter each get their own
      redirect, and the provider is never called.
- [x] **Attempted patient-name or medical-detail entry** — refused before any
      network call.
- [x] **Guard vs. catalog collisions** — "Surgery Check-In desk" and "Patient
      Billing Office" are usable on their own routes but still refused
      elsewhere; unambiguous emergencies still trigger on the emergency route.
- [x] **Invented routes are discarded** — a confident provider reply naming a
      floor, elevator, or department not on the pass is rejected by the
      post-filter, as is any claim to know the visitor's live location.
- [x] **Provider outage** — still yields the phone fallback.

## Manual — before demonstrating

### QR scanning on a real phone
- [ ] Scan from the desk screen with a stock iOS camera and a stock Android
      camera, at arm's length and at ~1 m.
- [ ] Scan at low screen brightness and at an angle.
- [ ] Confirm `CAREPATH_PUBLIC_ORIGIN` is set — otherwise the QR encodes a host
      the visitor's phone cannot reach.

### Text size and contrast
- [ ] Read the visitor page at arm's length without glasses.
- [ ] iOS Settings → Display → Larger Text at maximum; Android font size at
      maximum. Steps must still be readable and the bottom bar must not cover
      the last step.
- [ ] Check contrast with a checker; every foreground/background pair should
      clear WCAG AA at normal text size.
- [ ] Pinch-zoom works (it is deliberately not disabled).
- [ ] Tab through `/desk` with the keyboard only — focus must stay visible.

### Poor network connection
- [ ] Throttle to Slow 3G. The route page is server-rendered, so all steps
      should appear without waiting on JavaScript.
- [ ] Turn the network off entirely on the lost-help page and send a message —
      expect the "call the front desk" fallback with the CarePath ID, not a
      spinner or a stack trace.

### Speech, incorrect transcription, and manual correction
- [ ] Say "directions to imaging" — confirm the recognized destination appears
      and requires a tap to confirm.
- [ ] Deliberately mumble or say a wrong destination — confirm you can correct
      it from the list without re-speaking.
- [ ] Deny microphone permission — confirm a clear message and that the search
      box still works.
- [ ] Test in a browser with no Web Speech API (Firefox) — the mic button should
      be disabled and the search box should carry the whole flow.

### Front-desk operating process
- [ ] Read an `RP-####` aloud over a phone and have a colleague type it. Confirm
      "rp 4821" and "4821" both resolve.
- [ ] Confirm the lookup shows origin, destination, steps, and expiry — and
      nothing else.
- [ ] Look up an ID that has expired; confirm the message tells staff why.

### Expiry, in the real clock
- [ ] Create a pass, note the stated expiry, and confirm it matches eight hours
      from creation in the local timezone.
- [ ] Open an expired or invented token; confirm the same neutral "no longer
      active" page for both, with the Call Front Desk button.
