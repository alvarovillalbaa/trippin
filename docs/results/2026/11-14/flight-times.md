# Flight times follow airport clocks

14 November2026. Standing owner approval covers this focused repair and checks.
The [travel brief](https://app.notion.com/p/3faa1ee8bd0680ce8a9ccd907d6c49fd)
requires flight tracking. Its returned unverified snapshot is20October; current
code, not a claimed fresh brief edit, establishes this defect.

At baseline d36c24cc the normalized provider record already carried origin and
destination zones, but the flight panel formatted both instants in the viewer's
zone. The [source-derived baseline](flight-clock-baseline.json) shows the same
Madrid departure as08:00 in UTC or00:00 in Los Angeles, instead of09:00 at the
airport. This is native Date evidence, not a browser or real flight observation.

`lib/flight-times.ts` now produces origin-local departures and destination-local
arrivals with dates, offsets and zone names. Missing/unsupported zones explicitly
use UTC; absent/invalid instants say Unavailable. Scheduled times remain visible
beside the latest estimate or actual, independently for each airport. The actual
provider panel consumes those rows and labels its unchanged date filter UTC.
No provider, reservation, private trip, API, credential or dependency change.

[Eight native identities](flight-times-checks.json) pass under UTC and Los Angeles
on Node26.8.2, using authored normalized flights and actual Intl. These are eight
identities across two host profiles, not sixteen distinct tests. Both first
profiles passed7/8: their exact UTC-name expectation rejected this runtime's
valid GMT+0 spelling. Only that assertion changed to allow GMT or GMT+0; the
application was unchanged. Both normalized first streams are retained alongside
the successful TAP. Exact original streams/source are retained in the local
handoff; published streams replace only the absolute repository prefix with
`<repo>`. Node's existing typeless-module warning remains visible.

Release-build and hosting evidence will be recorded after the preview completes.
No local dependency installation/build/server/browser occurred below Storage
Guard. Native/view-model evidence does not establish React layout, browser
integration, live FlightAware status/entitlement/quality, physical devices or
full-product acceptance. Earlier accepted travel suites were not replayed.
