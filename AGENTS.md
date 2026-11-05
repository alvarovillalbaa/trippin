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
