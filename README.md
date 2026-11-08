# trippin

Last updated: 2026-11-08

A flexible travel workspace for the days you have, and the things you stumble into.

Built with Next.js, React, Leaflet/OpenStreetMap, and Vercel EVE. Node 24 is required by EVE.

```sh
npm install
npm run dev
```

Live app: **[trippin-theta.vercel.app](https://trippin-theta.vercel.app/)**.

`npm run build` creates the production application. `npm run check` checks the TypeScript contracts. Read [the product contract](docs/product.md), [integration availability](docs/integrations.md), [travel API setup](docs/providers.md), [Sandbox bank setup](docs/bank.md), and [EVE setup](docs/eve.md).

Create trips worldwide with city search; edit dates, budget, and daily stops; skip or swap plans; compare stays by price and commute; track reservations and actual expenses; export a travel story card. Choose the events you are open to, discover them within your trip dates, and confirm an editable itinerary stop and EUR admission estimate. Completed events earn individual badges alongside country milestones. Trips, itinerary choices, reservations, expenses and your profile persist in your browser. Stay-comparison inputs are temporary scratch estimates and reset when the calculator remounts or the page reloads. Export a backup before clearing site data. The Munich trip and community previews are sample data. Prices are planning estimates and provider purchases happen externally.

CSV expenses use EUR; an explicit foreign, blank or ambiguous currency column is rejected. Compact backups preserve private workspace data and restore within the existing workspace limit; oversized or unsupported in-memory data remains exportable as a recovery archive. Restore validates the file and saves it before replacing current trips. See the [CSV/backup repair](docs/results/2026/10-27/csv-backup-repair.md) and [ten passing hosted desktop/narrow Chromium cases](docs/results/2026/11-05/csv-backup-checks.md), including actual download/restore/reload and safe navigation during map zoom.

Overlapping CSV reads append against the latest trip and workspace limits. Reads for a deleted or restored trip are ignored; newer edits survive. See the [CSV state repair](docs/results/2026/10-27/csv-import-state.md).

The [first itinerary lifecycle receipt](docs/results/2026/11-07/itinerary-lifecycle-attempt-1.md)
passes desktop and narrow touch-emulated private-browser journeys for completion
reversal, skip/restore and the existing garden/museum alternative. Whole-workspace
reloads, stable IDs/linkage and EUR 25 → 16 → 25 → 37 day estimates passed on
the labeled sample. This does not accept providers, real travel prices or devices.

The [second manual-wallet receipt](docs/results/2026/11-07/linked-wallet-attempt-2.md) passes the linked event-reservation
and actual-expense flow in desktop/narrow private Chromium. Save EUR 20, edit the
same reservation to 24, record actual 18, remove the reservation while retaining
its expense against the admission, then delete it: totals 687 → 695 → 699 → 693
→ 693 → 687 and exact original workspace restoration passed after real reloads.
The first failed selector attempt remains preserved. These are authored private
samples; no real reservation, purchase, bank or provider was exercised.

The [second stay-comparison receipt](docs/results/2026/11-08/stay-comparison-attempt-2.md)
passes both desktop and narrow touch-emulated Chromium journeys afresh: bounded
manual inputs, complete option totals rounded to cents, explicit ties and a
same-day trip with zero overnight nights. At EUR 20/hour, displayed totals
331.67 and 354.33 yield a 22.66 difference; the half-cent example rounds 1.005
to 1.01. Twenty-four whole-workspace observations, authored-trip creation/removal
and real reloads restore the exact original private sample. The first failed
selector attempt remains preserved. This does not verify live prices, transit
routing, physical devices or an assistant/model turn.

Public-plan management entries save before a publication request leaves the
browser. They remain available in **Your profile → Public plans you manage**
after deleting a private copy or restoring a workspace. Separate attempt records
preserve uncertain outcomes across tabs; a lost response is not treated as an
unpublished trip. Fresh publishing access requires browser storage and Web Locks;
existing publishing access keeps its current key. Clearing browser data still
loses that access. See the [management repair and proof limits](docs/results/2026/10-28/community-management.md).

EVE needs model credentials and the Vercel Workflow runtime for durable hosted execution. The public trip directory and requests need `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Missing integrations display explicit setup states. Never put provider secrets into browser environment variables.
