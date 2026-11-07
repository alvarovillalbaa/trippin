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


## Manual linked wallet — 7 November

The [second wallet receipt](results/2026/11-07/linked-wallet-attempt-2.md), run
42368205577, accepts revised W01/W02 at check source
`9a755d6e6d004e4210bf3ac7f000313a211701ec` (113 blobs / 4,805,234 bytes).
The actual browser runtime was separately pinned to baseline
`ac01586f10a0f1ff8609c00ee43300c57249a012` and READY production deployment
`dpl_BASnM5VtYvhPWUKnW4hcE5VDhodd`; metadata/alias were refreshed before
activation. Twelve real root HTML observations matched that DPL ID; no original
HTML or compiled-asset equivalence is claimed. Application inputs stayed exact.

Both profiles observed complete manual reservation/actual-expense reconciliation,
22 whole-workspace originals and exact final baseline restoration. Six real
named native dialogs and ten select readbacks verify the revised matchers.
First-attempt source/originals remain failed and unchanged; no earlier case
acceptance was carried. Both temporary workflows are disabled. Final status
documentation is later than the tested source; original source/body identities
and proof limits remain in each receipt. No provider, account, bank, purchase,
server/database, physical-device or whole-product proof follows.

Storage Guard measured 11.6 GiB free against 34 GiB required during preparation.
No local install, build, server or browser run occurred. Focused tools/browser
ran in owned disposable Ubuntu CI storage, preserving HOME and teardown evidence.
