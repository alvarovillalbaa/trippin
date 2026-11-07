# Trippin itinerary lifecycle — first accepted attempt

Accepted **L01 and L02**, once each, as Tier 2 focused browser-client integration.
The two real public-UI journeys used fresh private Chromium contexts and the
application-authored Munich sample. Earlier core, CSV/backup and zoom checks were
not rerun. See the [scope](../../../proposals/itinerary-lifecycle-checks.md).

- [Run 42364155927](https://github.com/alvarovillalbaa/trippin/actions/runs/42364155927), job 128378602695, workflow 410247231; create event, attempt 1.
- Job: 7 November 2026, 10:29:27–10:30:05 UTC, success.
  Controller: 10:29:33.659–10:30:03.331 UTC; report passed, errors empty.
- Preparation source: `562876d25a59e91fba22a5a009729e0dcb26cc1b`;
  activation: `31162516e5751628b71a15f459f3db69f9c5ccb4`.
- Runtime Git base: `a6ec77dcb116e52246374ac023dcb5b5f83fb029`.
  Canonical alias: https://trippin-theta.vercel.app;
  expected deployment `dpl_cj8QiA2iUWRyiTxDyhzjntbUFJ4q`.
  Root separately refreshed READY/source metadata at 10:27:57 UTC.
- Only this temporary workflow was disabled; fresh API readback at 10:31:38 UTC
  reported `disabled_manually` (update 10:31:37 UTC).

The [original JSON](itinerary-lifecycle-attempt-1.json) and
[single-read complete job log](itinerary-lifecycle-attempt-1.log) were saved before
interpretation. The unique report payload in the log reproduces the JSON file,
including its final newline.

| Original | Bytes | SHA256 |
| --- | ---: | --- |
| JSON | 379,877 | `1bb3aa797c21580897a480e2d74fea00da1471994d5c70bc9160c0085fa28724` |
| Job log | 399,405 | `ede491db5c815f6048c98472628b5f9eb1b87a946b064a60c5b4c3f03c854073` |

All **101 retained gzip records** decode: 730,437 raw / 198,897 compressed bytes.
These are 76 command streams, two tool-state records, one browser-output copy and
22 workspace snapshots. They are not unique payloads or extra executions.
All streams match byte counts, SHA256 and EOF fields (260,696 raw / 74,032 gzip).
The 2,185-byte lock original and 761-byte resolved-tree copy decode; the tree copy
and 150,849-byte browser-output copy equal their command stdout originals.
All 38 commands exited zero, were reaped, closed both pipes and left their
original groups absent, without signals.

Both actual profiles completed eleven observations and five root navigations:
L01 desktop 1440×1000; L02 narrow touch-emulated 390×844. All 22 workspace originals
(315,946 decoded / 91,878 gzip bytes) were independently decoded and the complete
expected workspace rebuilt at each stage. Done → planned → done persists;
skipping the EUR 9 coffee yields 3 stops / EUR 16, restoring yields planned /
4 stops / EUR 25. The museum swap retains its existing ID and 14:30, produces
4 stops / EUR 37, and leaves the old garden skipped, hidden and linked. Every
unrelated value and every reload pair agrees exactly. All ten root responses
were 200 with one expected deployment ID; HTML bodies were not retained.

Fatal read/mutation/WebSocket/request/HTTP/page-error/crash/route/extra-page/
download counters were zero. Deliberate API/weather/tile/font blocks were
5/5/102/5 on desktop and 5/5/9/5 on narrow; these services were not exercised.
Node 24.21.0, npm 11.19.0 and the exact Playwright 1.61.1 chain were observed.
The isolated lock and root archive pin passed; generation and frozen npm ci used
disabled lifecycle scripts. Full Chromium plus headless shell was installed;
the launched version was 149.0.7827.55. No full-Chrome getter hash is claimed to
identify the actual launched headless-shell binary.

All 102 source rows / 3,504,195 bytes match the immutable Git tree's modes,
blob IDs and sizes; each baseline/bundle body was independently rehashed.
Five full source/index/native guards share vector
`c57f8b73a60a4c582c11e222205092c8801c7042cb118f5cfb83888ea476d17b`.
Only scoped AGENTS documentation changed among the prior 97 paths; five paths
were added and all 96 other prior blobs stayed exact. The driver copy matches
`6c38253bcdfb0faa7bad18000a42fd13a94538f05a3bc83e088c70df5e2e1798`.

Two contexts and pages closed normally; expected browser disconnect was observed.
Pending jobs/requests and remaining contexts were zero. Eight distinct attributed
PID/starttime observations were gone, with no uncertainty or supervisory signal;
this inventory is not a host-wide process count. Owned scratch removal passed.
The 720-second work budget remained within the earliest-step 15-minute clamp,
with 90 seconds cleanup and 30 seconds margin reserved.

This proves the two named client journeys, not server/database/provider/model,
account, real-traveler, physical-device, cross-browser or full-product acceptance.
READY metadata, decoded HTML deployment observations and unchanged source inputs
remain separate; no compiled-asset/source equivalence or host-wide network/write
attestation follows. Linux library disposal relies on the ephemeral runner.
No local install, app build, server, browser run, rerun or source repair was made.
