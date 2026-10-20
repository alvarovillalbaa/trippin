# Trippin

Trippin is a Next.js travel workspace with an EVE travel assistant. Use Node 24.

- Read `README.md` and `docs/product.md` before changing behavior.
- Preserve the trip model in `lib/types.ts`; browser state is private to each browser unless explicit sharing is enabled.
- Never present seeded trips, events, prices, flight statuses, or people as live provider data.
- Keep provider credentials on the server. Never store bank credentials or payment details.
- AI suggestions require explicit user application before modifying a trip.
- Use `npm run check`, `npm run build` when validating a release, and `git diff --check`.
- Keep integration setup and proof boundaries documented in `docs/`.
