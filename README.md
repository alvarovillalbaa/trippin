# trippin

A flexible travel workspace for the days you have, and the things you stumble into.

Built with Next.js, React, Leaflet/OpenStreetMap, and Vercel EVE. Node 24 is required by EVE.

```sh
npm install
npm run dev
```

`npm run build` creates the production application. `npm run check` checks the TypeScript contracts. Read [the product contract](docs/product.md), [integration availability](docs/integrations.md), and [EVE setup](docs/eve.md).

Trip creation, itinerary changes, budgets, reservations, spending preferences, and profiles persist in your browser. Export a backup before clearing site data. The Munich trip and community previews are sample data. Prices are planning estimates and provider purchases happen externally.

EVE needs model credentials and the Vercel Workflow runtime for durable hosted execution. The public trip directory and requests need `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Missing integrations display explicit setup states. Never put provider secrets into browser environment variables.
