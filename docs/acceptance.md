# Delivery coverage

This release builds the product with provider credentials deferred at Alvaro's request. Passing a build does not prove live provider behavior.

| Brief | Implementation | Proof scope |
| --- | --- | --- |
| Solo/weekend/4–7-day trips | Multiple trips, any city via geocoding, editable dates/budgets, private browser persistence and backup | Source inspected; hosted TypeScript/production build. City provider/browser flow not exercised. |
| Map on right | Leaflet/OSM, selected-day pins, walking estimates, external directions, mobile map toggle | Source/build; no browser or tile rendering proof. |
| Flexible itinerary | Add/edit/reorder/complete/skip/swap stops, seeded rain alternative, date changes preserve agenda order | Source/build; interaction QA not run. |
| Full trip costs | Flights/stays/tickets, activity admissions, daily food/transport, linked actual expenses; ticket reservations can replace itinerary estimates | Source/build; no financial/provider quotes claimed. |
| Center access/stay choice | Commute-aware stay calculator, nightly costs/fees/transit/time, optional value of time | Source/build; manually supplied estimates, no transit routing provider. |
| Ticketing | Editable flight/stay/event wallet; external booking/checkout; FlightAware status and Ticketmaster search adapters | Source/build; unconfigured provider requests return503. No native purchase/ticket issuance. |
| Airbnb, Meetup, Luma, Strava | Provider discovery links and manual capture, documented API constraints | Source/build and official documentation; no unauthorized provider imports. |
| Open trips/join requests | Redis directory, publishing capability, request/contact privacy, accept/decline, unpublish | Source/build; unconfigured writes return503. Configured Redis operations not exercised. |
| Personalization | Profile/interests/daily spending, CSV expenses, optional Plaid Sandbox aggregate preview | Source/build; Plaid missing-config refusal verified. Production bank linking not provided. |
| Badges/social profile | Derived country/activity badges and downloadable travel story overlay | Source/build; download and physical visits not verified. |
| AI with EVE | Real agent, arithmetic/stay tools, streaming hook, consent for limited context, cancellation, explicit setup state | EVE build and health verified; disabled sessions return401. No live model/Workflow turn. |
| GitHub + Vercel | Public repository, Git-backed Node24 production deployment, public alias | GitHub commit state, Vercel READY/build logs, public HTTP200, bounded receipts in deployment-verification.json. |

Before broad public social use, add account recovery/verified session ownership, moderation and stronger abuse controls. Before activating paid APIs/AI, configure budgets and rate controls. Real bank linking and native purchases need their respective account/payment/consent designs and provider approvals.
