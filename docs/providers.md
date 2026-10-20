# Optional live provider lookups

`GET /api/providers` reports configuration presence only. A configured status does not prove a valid credential, provider entitlement, or successful live request. Credentials remain server-side: `FLIGHTAWARE_API_KEY` and `TICKETMASTER_API_KEY`.

`POST /api/providers` accepts JSON and requires an `Origin` equal to the request URL's origin. Each operation makes at most one upstream request, with an eight-second timeout, a bounded response, no retries, and no pagination. Missing credentials return HTTP 503 with `code: setup_required`. Errors are sanitized; upstream bodies and request URLs are never forwarded. Successful responses include `source`, `mode: live`, and `fetchedAt`. No error or missing configuration falls back to sample data.

## FlightAware

Request: `{ "provider": "flightaware", "identifier": "LH1801", "date": "2026-10-20" }`. Omit `date` for the provider's recent and scheduled results. Date filters use the entire UTC day; the supported range is nine days ago through tomorrow, keeping both bounds inside AeroAPI's recent-data window. ICAO identifiers such as `DLH1801` avoid IATA ambiguity.

The adapter calls AeroAPI `GET /flights/{ident}` with `ident_type=designator`, `max_pages=1`, and `x-apikey`. An optional date becomes inclusive `start` and exclusive `end`. It returns up to 12 normalized `flights`, preserving multiple matches instead of assuming one is the traveler's booking. Summaries contain identifiers, status, airports, scheduled/estimated/actual gate times (with runway-time fallback), and cancellation/diversion flags. Null means the provider did not supply the field. `moreAvailable` indicates that this bounded lookup omitted more pages.

Source: [FlightAware's official OpenAPI, version 4.17.1 inspected 2026-10-20](https://www.flightaware.com/commercial/aeroapi/resources/aeroapi-openapi.yml). Account access, billing, and a valid key are external prerequisites. This lookup neither books flights nor changes reservations.

## Ticketmaster

Request: `{ "provider": "ticketmaster", "city": "Munich", "countryCode": "DE", "startDate": "2026-10-22", "endDate": "2026-10-25", "size": 12 }`. Size must be an integer from 1 to 12; the default is 8. Country is optional and must be an uppercase ISO2 code. Date bounds are optional as a pair and accept a real calendar range of at most 31 inclusive days. Older saved trips without a country code remain valid; city-only queries can be ambiguous.

The adapter queries Discovery v2 `events.json`, authenticating with the server key in `apikey`. It applies `city`, optional `countryCode`, `size`, and `sort=date,asc`. A dated trip uses the documented `localStartDateTime` range with local midnight and end-of-day bounds, and excludes TBA/TBD dates. Returned local dates are checked against the trip again. A query without dates retains the upcoming `startDateTime` behavior. The adapter uses comma-separated local-range bounds; provider acceptance of that serialization remains unverified without a key.

Results contain bounded IDs/titles, local date/time, UTC start, announcement flags, timezone, event status, venue/city/country, finite venue coordinates when supplied, a classification-based planning category, external ticket URL, and optional price range. Numeric coordinate strings are normalized against latitude/longitude bounds. Categories are planning hints, not a claim that a venue is outdoors. Price ranges are estimates and `isFinalTotal` is always false. Missing prices are null, never zero; missing maximum prices display as “from” a minimum. `moreAvailable` reports additional results without fetching them.

Profile event preferences filter results locally and are not sent to Ticketmaster. The traveler can switch to all results. “Plan this event” opens a local, editable draft on its matching trip day; TBA, canceled, postponed, rescheduled, and outside-trip events cannot be added directly. A missing or non-EUR quote leaves the EUR budget empty and requires the traveler to enter an estimate. No currency conversion is inferred. Unknown venue coordinates start at an explicitly described city-center pin. The saved activity carries provider identity and source metadata, and admission contributes once to the trip budget. A later saved reservation can replace this estimate through `Booking.activityId`.

Users complete purchases with the provider; planning an event neither reserves inventory nor charges money. Fictional sample event ideas appear in a separate, collapsed section and retain sample labels when saved. Provider failures never turn into sample results.

Sources: [official Discovery v2 contract](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) and [restricted transactional Partner API](https://developer.ticketmaster.com/products-and-docs/apis/partner/). A developer account/key is required for discovery; native purchasing requires a separate approved distribution relationship.

## Verification and operational boundary

The adapter source was reviewed against the official contracts. Production builds run on Vercel and unconfigured API refusal paths have HTTP evidence. Browser flow and live-provider verification remain separate and unverified; no provider credential was used during implementation. Configure provider account quotas and deployment-level access/rate controls before enabling paid credentials: the same-origin check protects browser requests, but it is not caller authentication or a distributed usage limit.
