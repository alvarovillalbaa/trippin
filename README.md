# trippin

A flexible travel workspace for the days you have, and the things you stumble into.

Built with Next.js, React, Leaflet/OpenStreetMap, and Vercel EVE. Node 24 is required by EVE.

```sh
npm install
npm run dev
```

Live app: **[trippin-theta.vercel.app](https://trippin-theta.vercel.app/)**.

`npm run build` creates the production application. `npm run check` checks the TypeScript contracts. Read [the product contract](docs/product.md), [integration availability](docs/integrations.md), [travel API setup](docs/providers.md), [Sandbox bank setup](docs/bank.md), and [EVE setup](docs/eve.md).

Create trips worldwide with city search; edit dates, budget, and daily stops; skip or swap plans; compare stays by price and commute; track reservations and actual expenses; export a travel story card. Choose the events you are open to, discover them within your trip dates, and confirm an editable itinerary stop and EUR admission estimate. Completed events earn individual badges alongside country milestones. These features and your profile persist in your browser. Export a backup before clearing site data. The Munich trip and community previews are sample data. Prices are planning estimates and provider purchases happen externally.

CSV expenses use EUR; an explicit foreign, blank or ambiguous currency column is rejected. Compact backups preserve private workspace data and restore within the existing workspace limit; oversized or unsupported in-memory data remains exportable as a recovery archive. Restore validates the file and saves it before replacing current trips. See the [CSV/backup repair and verification limits](docs/results/2026/10-27/csv-backup-repair.md).

Overlapping CSV reads append against the latest trip and workspace limits. Reads for a deleted or restored trip are ignored; newer edits survive. See the [CSV state repair](docs/results/2026/10-27/csv-import-state.md).

EVE needs model credentials and the Vercel Workflow runtime for durable hosted execution. The public trip directory and requests need `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Missing integrations display explicit setup states. Never put provider secrets into browser environment variables.
