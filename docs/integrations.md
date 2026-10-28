# Integration availability

Last updated: 2026-10-28

Verified against official provider documentation on 20 October 2026. Seed trips, events, people, reservations, and prices are sample data. No travel purchase is made by Trippin.

| Surface | Implemented behavior | Live setup or restriction |
| --- | --- | --- |
| Map | Leaflet, OpenStreetMap public tiles, selected stops, external walking directions | Follow [tile usage policy](https://operations.osmfoundation.org/policies/tiles/); attribution retained, no prefetch/offline bulk downloads. Switch to a commercial tile service before substantial traffic. |
| Weather | Current temperature from Open-Meteo with visible unavailable state | [API documentation](https://open-meteo.com/en/docs); public endpoint is for noncommercial use. Use a commercial plan before monetization. |
| Public trips | Redis-backed public directory, owner capability, private join requests, accept/decline API, unpublish API, bounded TTL/rate limits | Configure Upstash REST URL/token. No persistence or sent-request claim when unconfigured. [REST API](https://upstash.com/docs/redis/features/restapi). |
| EVE | Real framework integration and optional streaming assistant | See [EVE setup](eve.md). Disabled by default until explicitly enabled with model access. |
| Airbnb | External search and manual reservation capture | [Approved software partners](https://www.airbnb.com/software-partners) and [API terms](https://www.airbnb.com/help/article/3418) do not establish open consumer inventory access. |
| Booking.com | External search and saved stays | [Demand API prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites): managed affiliate contract, token, affiliate ID. |
| Flight status | FlightAware status lookup, provenance, retrieval time; manual flight wallet | [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/) requires a usage key. See [adapter setup](providers.md). Live provider verification awaits credentials. |
| Flight purchases | External flight discovery and reservation capture | [Duffel](https://duffel.com/docs/guides/getting-started-with-flights) live booking needs verified account, token, payments, and explicit checkout. Native ticket issuance is not shipped. |
| Meetup | External event/community discovery | [API access](https://help.meetup.com/hc/en-us/articles/41453576628749-How-can-I-get-access-to-Meetup-s-API) needs Pro and OAuth approval; GraphQL. |
| Luma | External discovery | [API](https://docs.luma.com/reference/getting-started-with-your-api) needs Plus and a key scoped to an owned calendar; not a universal city feed. |
| Ticketmaster | Server-side event search when configured; external checkout | [Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery/) needs a key. Native purchase requires approved Partner API access. See [adapter setup](providers.md). |
| Strava | External club search; first-party manually entered trip activities | [API policy](https://www.strava.com/legal/api_policy) restricts AI and agent-mediated data use. No Strava data enters EVE. OAuth import requires explicit provider approval of the full use case. |
| Bank expenses | Manual preferences, CSV import, optional Plaid Sandbox Link with aggregate preference preview | [Sandbox setup](bank.md). No production bank linking. Real accounts require consent-based Link, backend authorization, production/product approval, and geography-specific onboarding. Tokens and transactions are not persisted. |
| Destination search | Public Open-Meteo city geocoding, explicit city selection | [Geocoding API](https://open-meteo.com/en/docs/geocoding-api) public endpoint is for noncommercial/prototype use; subscribe before commercial use. |

## Community setup and privacy

Create an Upstash Redis database in your own account and set server-only `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel. Redeploy. Public trip records deliberately omit expenses, booking references, companions, and saved booking URLs. Itinerary text is public when published; review it before publishing.

Publishing creates an unguessable owner capability in localStorage; only its SHA-256 digest reaches Redis. The publishing browser can review requester contact information. It is not account authentication or identity verification. Clearing browser data loses host access; a general trip export does not preserve this capability. A production social network needs account recovery, reporting/moderation, stronger distributed abuse controls, and session-bound authorization before broader launch.

Management labels and attempt outcomes use separate per-entry browser records;
they contain no capability, expenses, bookings or requester contacts. Publication
requires a saved recovery reference before POST. New attempts use distinct keys,
and each acknowledgement updates only its own attempt. Unpublish cleanup captures
confirmed records before DELETE and retains unknown or later attempts. Profile
management works even when the private trip is absent from a restored workspace.
Unknown outcomes may leave conservative management entries after an acknowledged
unpublish; this does not prove a delayed server write cannot arrive later.

First-use owner initialization uses an exclusive Web Lock around re-reading and
writing the existing owner key. Browsers without that API cannot initialize fresh
publishing access; an existing owner key continues to work. The lock is released
before any network request. Capability format, API authorization and provider
configuration are unchanged. Browser behavior and configured Redis acceptance
remain unverified for this repair; see the [owning receipt](results/2026/10-28/community-management.md).

Data expires after 90 days. Hosts can unpublish; the API deletes associated requests. Request contact information never appears in the public directory. Do not collect bank details, passports, payment cards, or sensitive personal data in introductions.
