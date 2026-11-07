# Trippin

Trippin is a Next.js travel workspace with an EVE travel assistant. Use Node 24.

- Read `README.md` and `docs/product.md` before changing behavior.
- Preserve the trip model in `lib/types.ts`; browser state is private to each browser unless explicit sharing is enabled.
- Never present seeded trips, events, prices, flight statuses, or people as live provider data.
- Keep provider credentials on the server. Never store bank credentials or payment details.
- AI suggestions require explicit user application before modifying a trip.
- Use `npm run check`, `npm run build` when validating a release, and `git diff --check`.
- Keep integration setup and proof boundaries documented in `docs/`.

## Approved portability acceptance — 2026-11-05

The user's standing "I approve everything / Keep going / Do all the work"
instructions cover the [v2 CSV/backup scope](docs/proposals/csv-backup-browser-v2.md):
ten real desktop/narrow-touch Chromium cases on the public app: the original
eight portability cases and two user-zoom/navigation lifecycle regressions, using only
authored private browser data, in one temporary public Ubuntu job per changed
candidate, capped at 15 minutes. Pin both the reviewed source and the actual
READY deployment served by the alias. The temporary push workflow belongs only
to `qa/trippin-portability-20261105` and is retired after a terminal run.
Install only the pinned browser tool/Chromium in owned runner storage; do not
install application dependencies or alter the app manifest. Block APIs,
providers, mutations and unexpected network traffic; no account, model call,
server write, bank connection or public trip is part of this acceptance.
Preserve failures and verify owned cleanup. Local Storage Guard still applies;
this scope does not authorize a local install, build or browser run below its
reserve.

## Approved itinerary lifecycle acceptance — 2026-11-07

The owner's renewed "Keep going / Do all the work" and standing approval cover
this [focused itinerary packet](docs/proposals/itinerary-lifecycle-checks.md):
one desktop and one narrow touch-emulated Chromium journey using the labeled
Munich sample in fresh disposable private browser contexts. It covers done,
skip/restore, the authored garden/museum alternative, estimates and reload.
The earlier creation/share and ten CSV/backup/zoom cases remain closed.

Use only the reviewed source and an actually READY canonical deployment, with
unchanged application input bytes explicitly bound to its Git source. This is
Tier 2 browser-client integration; hosted backend, providers, models, physical
devices and full-product acceptance remain separate. Block/count the existing
API/weather/tile/font boundaries; unexpected reads, mutations, WebSockets and
page errors fail. Do not seed app state or invoke internal handlers.

One temporary public Ubuntu job per changed candidate is capped at 15 minutes.
Install only the pinned browser tool/Chromium in owned runner storage, preserve
HOME and original failure outputs, and verify source/browser/process teardown.
Do not install application dependencies, run a broad app build, change paid
services or retry an unchanged failure. The workflow belongs only to
`qa/trippin-itinerary-20261107-1` and is disabled/retired after its terminal run.
Storage Guard still prohibits local installs, builds and browser runs below its
reserve. No local storage exception is granted here.
