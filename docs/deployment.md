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

Storage Guard failed at 32.4 GiB free versus 34 GiB required. The in-progress local dependency install was stopped without installing an environment. No local production build, broad TypeScript check, browser smoke check, or test suite was run. Hosted deployment build logs and public HTTP checks are the intended release evidence; record exact commit/deployment IDs in `deployment-verification.json` after verification.

Live provider calls require the user's later credentials. No live model reply, flight status, native purchase, bank account, or shared-store mutation can be claimed from a successful build or readiness endpoint. Native travel purchases and general production bank linking are separate provider/account integrations.
