# Third hosted portability run: same two CJK errors

5 November 2026. Preserved before adding public-asset stack diagnostics.

Source `ad4f4882f7f77d6027460aff9bea8455a6b2cdb2`, tree
`161b82cfe64fea267ff8520972eb6e7bfb643065`, ran against READY
`dpl_FJSdna17nCZkt4Jirf2NmuxdBGdJ`, also verified in actual public-alias HTML.
[Run 41963741523](https://github.com/alvarovillalbaa/trippin/actions/runs/41963741523),
job `127035833884`, failed. Controller **03:47:20.671–03:48:16.511 UTC**;
job **03:47:12–03:48:18 UTC**.

All eight exact cases ran once, retry zero. Six passed; both CJK cases failed
the uncaught-error guard with the same `TypeError` reading `_leaflet_pos`
from undefined and fingerprint `048d1ae1…8d878`. No cases were skipped or
flaky; global errors were empty. The owned resize/tile/marker callback guards
were insufficient to resolve this exception. No precise callback stack was
retained; an internal zoom-timer path remains a hypothesis, not a finding.
The [full receipt](csv-backup-attempt-3.json) retains the actual browser report.

All 14 root HTML observations returned 200 with the pinned unique deployment.
Known fonts were blocked; unexpected reads, mutations and WebSockets stayed
zero. Four complete guards protected 90 files/2,869,096 bytes. All 28 command
groups were reaped, closed with pipe EOF and absent; only the browser CLI
exited 1. All 35 attributed processes disappeared, with no supplemental signal,
no uncertain attribution and an empty final scan. Owned scratch cleanup passed;
repository ignored/untracked output stayed empty.

Original scenario bodies, fixtures and assertions remain intact. CJK data
assertions completing does not establish a passing case while page errors
occur. No local install/build/browser, account, provider/model call, server
mutation or public trip was used. Full eight-case acceptance remains pending.
