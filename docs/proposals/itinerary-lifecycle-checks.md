# First itinerary lifecycle browser-client checks

Status: [L01/L02 passed their first invocation](../results/2026/11-07/itinerary-lifecycle-attempt-1.md),
run `42364155927`, at preparation `562876d25a59e91fba22a5a009729e0dcb26cc1b`.
Original captures, source/deployment observations and owned cleanup passed
independent audit; the temporary workflow is disabled. No retry or app repair
occurred. The preparation contract below retains its original scope. The owner
renewed autonomous work and approved checks/temporary free CI. Baseline source is
`a6ec77dcb116e52246374ac023dcb5b5f83fb029`; the existing core journey and ten
CSV/backup/zoom cases stay closed.

At preparation, the product and acceptance contracts already implemented
completion, skip and alternative selection, while their browser behavior was
unverified.
This packet uses the labeled Munich sample in fresh disposable private
contexts; no fixture import, state injection, internal handler invocation,
real booking or real traveler data is required.

## Two exact journeys

L01 uses desktop Chromium at 1440 × 1000. L02 uses narrow Chromium at 390 × 844
with supported touch emulation. Both run once, sequentially, without retries:

1. Observe Munich day one's four planned stops and EUR 25 estimate.
2. Mark the EUR 9 coffee stop done, toggle it back to planned using its completion
   button, then mark it done again. The count/estimate remains four / EUR 25;
   observe all three states and then reload to verify done persistence.
3. Skip that stop: three stops / EUR 16. Restore it to planned: four / EUR 25.
   Reload after each phase. Restoration does not restore the earlier done status.
4. Swap the garden for its existing museum alternative. Reuse the museum's ID,
   retain 14:30, make it planned and clear its `alternativeFor`. The original
   garden becomes skipped and hidden with `alternativeFor` pointing to the museum.
   Four stops / EUR 37 and the persisted linkage must survive reload. The full
   journey has eleven named observations per profile.

Use actual buttons/taps and visible UI, with read-only observations of the
owned browser's stored values. Completion is self-reported, not location or
organizer verification. Do not test destructive date-shortening, linked booking
reconciliation, badges, public plans, providers or AI in this packet.

## Source and network boundary

The source baseline has 97 blobs / 3,412,994 bytes. Preparation may append only
the scoped AGENTS instructions and add the driver, supervisor, inactive workflow,
this proposal and suite contract; every application input remains exact.
The served production source can therefore remain the baseline while the test
preparation has a different commit. Do not claim compilation from the test commit.

Vercel metadata freshly observed at 09:54:16 UTC on 7 November identifies
`dpl_cj8QiA2iUWRyiTxDyhzjntbUFJ4q` as READY/production, at the baseline Git SHA,
with canonical alias `trippin-theta.vercel.app`. Refresh before activation and
pin the actual served deployment. Every real root navigation/reload must find
only that deployment ID in HTML. Use the prior strict same-origin root/static/
image URL grammar. Public response hashes, if recorded, are observations only.

Block and count APIs, weather, map tiles and known Google Fonts requests.
Unexpected reads, mutations, WebSockets and page errors fail. Allowed anonymous
public reads can create ordinary hosting logs. No private server data, provider,
model, bank, public trip, account or server mutation belongs to this scope.

## Bounded execution

The Tier 2 driver lives at `tests/integration/browser/itinerary-lifecycle.mjs`;
the operational supervisor at `tests/scripts/run-itinerary-lifecycle-checks.mjs`.
The inactive workflow example is `itinerary-lifecycle.workflow.yml.example`.
One temporary public Ubuntu job is capped at 15 minutes. Use Node 24.21.0 and
the existing pinned Playwright 1.61.1 in an isolated frozen tool installation.
Do not install application dependencies, build/start the app or reuse browser
profiles. Keep original HOME and owned npm/config/cache/XDG/browser/temp paths.

The supervisor clamps its work to 720 seconds using the earliest job-step clock,
reserving 90 seconds cleanup and 30 seconds startup/output margin. The driver
has 240 seconds work, 60 seconds cleanup and two seconds final output; retain
normal child/context/browser closure and original outputs before success gates.
Only positively attributed UID/PID/starttime/process groups may be signalled.
Uncertain closure retains its failure; external termination does not prove cleanup.
The temporary workflow belongs only to `qa/trippin-itinerary-20261107-1` and is
disabled/retired after the first terminal attempt. A concrete changed repair is
required before another attempt. Original failures remain preserved.

Optional Browserbase guidance is not installed. Its documented installer is
`python3 scripts/install-external-skills.py --skill browserbase-ui-test --agent codex`;
it is not run or required. The existing Playwright path needs no Browserbase
account. Local Storage Guard remains below reserve: source/AST/whitespace checks
only on this host; no local install, server, build or browser execution.
