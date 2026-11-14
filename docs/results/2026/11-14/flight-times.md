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
application was unchanged. Both normalized first streams are retained as JSON
strings alongside the successful TAP; decoded failed TAP bytes are unchanged.
The original TAP version also remains in bb2dda22 history. Its four indented blank
lines failed the final staged whitespace check; JSON wrapping preserves those
bytes without disabling checks. Exact original streams/source remain in the local
handoff; published streams replace only the absolute repository prefix with
`<repo>`. Node's existing typeless-module warning remains visible.

[PR #1](https://github.com/alvarovillalbaa/trippin/pull/1) merged as2960a648
after source bb2dda22 preview dpl_8gdap5o3mWGHPqXVk67bAYQrrSuK passed the
existing Next16.4.2 release build, including TypeScript. No separate
`npm run check` was invoked. Production dpl_593eN2wtVbcxzciajG344vCUcwyk is
READY at the exact merge and owns trippin-theta.vercel.app. Actual anonymous
document, eight script downloads and configuration GET returned200. The served
application chunk contains the UTC date label and explicit airport-zone fallback;
this is compiled delivery, not a browser-render test. Both providers remain
setup_required; no live provider request was made. The first Python-child chunk
request failed DNS before a body; direct native curl completed the observation.
See [hosting details and build excerpts](flight-times-hosting.json). Vercel's
existing install reports two dependency vulnerabilities; versions are unchanged
and vulnerability investigation is outside this flight-clock repair.

No local dependency installation/build/server/browser occurred below Storage
Guard. Native/view-model evidence does not establish React layout, browser
integration, live FlightAware status/entitlement/quality, physical devices or
full-product acceptance. Earlier accepted travel suites were not replayed.
