# Product contract

Trippin helps solo travelers and people with a weekend or 4–7 days make the most of a city without fixing every hour in advance. The initial experience uses an explicitly labeled Munich sample trip, not a claim about Alvaro's actual bookings or spending.

## Required experience

1. Create and manage multiple dated trips; save edits between visits.
2. Keep a flexible daily itinerary: add/edit/reorder activities, mark done or skipped, select alternatives.
3. Keep an interactive map on the right on desktop with selected-day places, estimates of walking distance/time, and external directions. Mobile gets an accessible map toggle.
4. Show full projected costs: flights, stays, event admissions, food, transport, and actual expenses without double counting linked reservations.
5. Keep flight, stay, and event reservations together, with external booking links. Native purchasing depends on provider agreements and payment setup.
6. Personalize around interests and ordinary daily spending. Bank credentials never enter Trippin; manual expense input and CSV import work without a bank provider.
7. Support a travel profile, derived country/activity badges, sharing, public trips, and join requests. Sample people and events must remain visibly labeled.
8. Offer an EVE assistant using Vercel's framework, with explicit credential availability, errors, and user consent before using private trip context.
9. Publish source to `alvarovillalbaa/trippin` and deploy on Vercel; keep release evidence and remaining provider prerequisites.

## Release boundaries

Local trip data belongs to the browser. Public directory/join requests require Upstash Redis REST credentials; without them the UI must not pretend requests reached another person. Public records exclude booking references and expenses. An owner capability is generated in the browser and hashed server-side. It is not a verified identity system.

External providers have independent contracts. Airbnb/Booking.com inventory, native flight purchases, Meetup sync, owned Luma calendars, bank linking, and Strava API import are not implied by a working UI. Record verified provider constraints in `docs/integrations.md`. All estimates, sample events, and sample people are visibly identified. Weather has an independent network failure state.

## Visual direction

An elegant travel journal: warm off-white, forest-green navigation and controls, orange accents, editorial destination photography, clear spatial hierarchy, quiet motion, and practical activity cards. Desktop is a three-column workspace; small screens collapse navigation and present an explicit itinerary/map choice. Respect keyboard navigation and reduced motion.
