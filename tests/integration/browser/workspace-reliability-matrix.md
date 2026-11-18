# Workspace reliability acceptance

Prepared 16 November 2026. **Source only; not executed or accepted.** This new
packet has the owner's explicit “I approve.” for an exact reviewed source/build and an owned
loopback server. Existing consumer V2, portability, itinerary, wallet, stay and
story/profile identities remain closed. Their acceptance is not carried here.
The isolated launch uses the exact owned QA ref; this driver installs, builds and serves nothing.

| Identity | Profile | Required fresh observations |
| --- | --- | --- |
| R-N01 | Desktop 1440 × 1000 | Create an authored Munich trip/stop through UI; save an authored local reservation and linked payment. Create a custom alternative in a blank, focused form. Retain original ID/data as a skipped alternative; create a new planned/custom ID at the original time; preserve booking/expense linkage. Independent EUR totals 20 → 18 → 27 → 18, recorded 0 → 18, including actual reloads. Restore the original through Swap and verify both stable IDs and unchanged paid records. |
| R-N02 | Desktop 1440 × 1000 | Create a 31-day trip through UI. Visit every tab with ArrowRight, wrap both boundaries, use Home/End, preserve Control+Home and Up/Down behavior, and Tab into the timeline. Require one tab stop, one selected tab, correct focus and panel label. Selection changes preserve exact saved workspace bytes, including reload. |
| R-N03 | Narrow 320 and 390 × 844, touch emulated | Create a named Munich trip and ten stops through actual controls. Switch to the map after scrolling past a long itinerary. Require the actual Leaflet container, ten markers and stop label, normal-flow map position, bounded visible map/routes with unobscured link centers, complete ordered links with at most three intermediate waypoints and 2048 characters, no horizontal overflow, and focus retained on both toggle directions. Return home and reopen the readable named/date card at both widths with exact durable data preserved. Maps links are inspected, never opened. |
| R-N04 | Desktop 1440 × 1000 | Create a durable baseline, enable only the authored workspace-write refusal, and add a stop through UI. Require persistent save warning after the transient notification lifetime, unchanged durable bytes, refused retry and an actual downloadable backup containing the volatile edit. Observe/dismiss the real beforeunload dialog; an in-app departure remains blocked. Remove the fault, retry, and verify the backup matches the newly saved state. A second authored edit exercises explicit Leave without saving, retaining the last confirmed state when reopened. |

Each identity has a new disposable context, no retries and at most three work
minutes. The four-case driver has a twelve-minute work deadline, separate bounded
context/browser closes and bounded JSON/DOM/screenshot artifacts. All four must
pass in the same invocation with normal closure. Failures are retained and need
a changed, reviewed candidate before any new invocation; partial results supply
no acceptance. A source error, unavailable host/tool or unconfirmed teardown is
not a pass. The supervisor owns server/process/scratch cleanup separately.

## Explicit boundaries

- `workspace-reliability.mjs` runs real controls; it never imports application
  helpers, seeds workspace storage or calls internal handlers. Read-only durable
  workspace observations are retained with hashes. Trip, stop, reservation and
  payment data are authored fixtures, not real travel/provider transactions.
  Successful UI changes use bounded read-only polling for their expected durable
  shape before snapshots; R-N04 deliberately checks the prior durable bytes.
- `/api/auth` accepts only a browser-intercepted `session` request and replies
  `{available:false,user:null}`. No request reaches Auth, no cookies are issued,
  and registration, login, confirmation, recovery and real account isolation
  are outside this packet.
- Known API reads, weather, map tiles and fonts are refused and counted.
  Unexpected reads, all mutations other than that intercepted session lookup,
  WebSockets, admitted request failures and uncaught page errors fail. Real
  provider, model, bank, email, booking, sharing and server writes are excluded.
  The sole admitted-failure exception is R-N04's deliberately cancelled reload:
  only an exact-current-URL main-frame GET with `net::ERR_ABORTED` during its
  ten-second reload intent is counted separately. The actual beforeunload dialog
  must still be observed and dismissed. Other requests and failures stay fatal.
- R-N04 alone installs a context-scoped `Storage.prototype.setItem` wrapper.
  It throws only for `trippin.workspace.v2.guest` when the named test-only flag
  `__TRIPPIN_RELIABILITY_TEST_ONLY_WRITE_FAILURE__` is true. The driver toggles
  that harness flag; it never injects app state. All other keys/methods retain
  their original behavior. This is a reviewed synthetic write refusal, **not
  native storage quota or platform-capacity proof**. Context closure discards it.
- The viewport case uses Chromium touch emulation and keyboard events. Actual
  physical devices, assistive technology and real map/provider availability
  remain unverified even after a future passing packet.

## Future invocation contract

Supply the existing separately provisioned pinned Playwright package through
`TRIPPIN_PLAYWRIGHT_PACKAGE`, the reviewed 40-character commit through
`GITHUB_SHA`, an owned output directory through `TRIPPIN_RELIABILITY_OUTPUT`,
and the owned loopback origin through `TRIPPIN_RELIABILITY_ORIGIN`. Only
`localhost`, `127.0.0.1` and `[::1]` HTTP(S) origins with a root path are accepted;
production and arbitrary external targets are rejected. The inactive guard
requires `TRIPPIN_RELIABILITY_APPROVED=1` after owner approval; setting a flag
does not itself grant that approval.

No command is executed in this preparation. A later authorized supervisor must
bind the driver’s source hashes to the exact built app, preserve original output
and confirm server/browser/process/scratch teardown. The driver records four
case IDs, boundary errors, authored fault classification, source input hashes,
actual downloaded backup and closure in `native-result.json`. It does not prove
release builds, production activation, real Auth or provider operation.
