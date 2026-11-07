# Deployment

Target: GitHub `alvarovillalbaa/trippin`, Vercel project `trippin` under the connected Clous Team. Publication is explicitly authorized in the original task brief. On 2026-10-20 Alvaro confirmed: build now, credentials will be added later.

## Configuration

Use Node 24, framework Next.js, root directory `.`, install `npm install`, build `npm run build`. `withEve` integrates the EVE agent build and Workflow service. Connect the GitHub repository for production updates from `main`.

Copy the variable names in `.env.example` into server-side Vercel environment settings when ready. Never put secret values in source, `NEXT_PUBLIC_*`, client storage, or deployment documentation. See [EVE](eve.md), [travel providers](providers.md), and [integrations](integrations.md).

Until configured:

- AI refuses sessions and shows its setup state.
- Community directory is unavailable and join/publish writes refuse requests.
- FlightAware/Ticketmaster show setup states, with no sample provider fallback.
- Manual trip planning, estimates, reservations, CSV import, profiles, backups, and snapshot links do not require provider keys.

## Proof boundaries

The [7 November itinerary packet](results/2026/11-07/itinerary-lifecycle-attempt-1.md)
passes L01/L02 at test preparation `562876d25a59e91fba22a5a009729e0dcb26cc1b`.
It exercised the actual canonical alias at READY deployment
`dpl_cj8QiA2iUWRyiTxDyhzjntbUFJ4q`, whose application Git source is
`a6ec77dcb116e52246374ac023dcb5b5f83fb029`. Test preparation added checks and
scoped instructions; every application input remained baseline-exact. Ten root
HTML deployment observations, 22 original workspace snapshots and owned teardown
passed. HTML bodies were not retained: observer hashes and source/deployment
metadata do not prove compiled-asset byte equivalence. No prior suite was rerun.

The [5 November hosted packet](results/2026/11-05/csv-backup-checks.md) passed ten desktop/narrow Chromium cases on pinned source `2bce8e4d` and production `dpl_DJSCKrtJjvezejN4g6gnjVRHfkvz`: CSV currency handling, actual CJK download/restore/reload, legacy restore/invalid UTF-8 preservation, and trusted navigation during map zoom. All 18 root HTML observations matched that deployment; source/process/scratch guards passed. Four preceding failures remain preserved. This is scoped browser-client evidence, with APIs/providers/fonts/tiles/weather blocked; it establishes no account, server-write, live-provider or physical-device acceptance.

Storage Guard failed at 20.8 GiB free versus 34 GiB required on 5 November. No local environment, build or browser was created. The earlier 32.4/34 GiB observation and interrupted local install belong to the original publication history. Focused browser tools ran only in owned disposable Ubuntu CI storage. Final documentation publication is separate from the checked application source and deployment above.

Live provider calls require the user's later credentials. No live model reply, flight status, native purchase, bank account, or shared-store mutation can be claimed from a successful build or readiness endpoint. Native travel purchases and general production bank linking are separate provider/account integrations.

## Published application

- App: https://trippin-theta.vercel.app/
- Source: https://github.com/alvarovillalbaa/trippin
- Dashboard: https://vercel.com/my-team-4f230354/trippin

Git pushes to `main` create production deployments. Preview/deployment URL protection remains enabled; the production alias is publicly accessible. No account-wide settings or existing projects were changed.

The hosted production build compiles Next.js, runs its TypeScript check, and builds the EVE service. Earlier HTTP probes cover initial HTML and service setup boundaries. The focused packets above add client portability, map-lifecycle and itinerary-state evidence; provider credentials, configured Redis/Plaid, physical mobile devices and whole-product behavior remain unverified.
