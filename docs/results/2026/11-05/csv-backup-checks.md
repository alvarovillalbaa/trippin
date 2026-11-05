# Hosted portability and map retirement: ten cases passed

5 November 2026. Checked source `2bce8e4de973ab127eacf48d40f129ad8641c52b`,
tree `776b2c82ecc90f4d3f52e6805c9208f610a6ef3d`, ran against READY production
`dpl_DJSCKrtJjvezejN4g6gnjVRHfkvz`, also verified in actual public-alias HTML.
[Run 41966406737](https://github.com/alvarovillalbaa/trippin/actions/runs/41966406737),
job `127044318492`, succeeded. Controller **04:13:09.338–04:14:07.361 UTC**;
job **04:13:01–04:14:10 UTC**. The [full receipt](csv-backup-checks.json)
retains raw command streams, actual Playwright JSON, boundaries and cleanup.

Five scenarios passed once in each desktop (1440 × 1000) and narrow touch-enabled
Chromium (390 × 844): **10 expected, zero unexpected/skipped/flaky**, retry zero,
empty case/global errors and actual browser CLI exit zero. The original four
scenario bodies, fixtures and assertions remain unchanged:

- EUR import appends once; explicit USD is rejected without losing expenses.
- Ambiguous duplicate and explicit blank currency are rejected without data loss.
- Actual CJK download above 2 MB restores after a visible profile edit and reload.
- Legacy pretty JSON above 2 MB restores; invalid UTF-8 cannot replace UI or saved state.
- New regression: a trusted Profile click occurs during an actual user zoom;
  the old host detaches and empties, a replacement zoom works, and reload retains
  markers and the unchanged complete durable workspace hash.

The repair gates controls until workspace restoration is ready. Map creation
initializes the final first viewport directly. Each effect owns its host and
instance; retirement fences callbacks, disconnects its observer and detaches
the host immediately. Active zoom completion reaches public `zoomend` before
owned removal runs in a microtask after Leaflet's dispatch. Controls, markers,
selected-place panning and normal user animations remain available. No private
Leaflet fields, synthetic events, ignored errors or fixed cleanup delay is used.

All **18 actual root responses** returned HTTP 200 with the pinned unique
deployment ID. Page errors, unexpected reads, mutations and WebSockets were
zero. API/weather/tiles/known font loads were blocked and counted; their live
availability is outside acceptance. Actual file choosers/download streams and
browser-private authored state were used, with no account or server mutation.

Five complete HEAD/index/mode/working-byte guards protected **94 files and
3,216,881 bytes**, without untracked/ignored exemptions. All **34 commands**
exited zero, were reaped/closed at pipe EOF and had absent original groups.
All **27 attributed same-UID processes** disappeared, with an empty final scan,
no uncertain attribution or supplemental TERM/KILL. Owned scratch cleanup passed.
Node was 24.21.0, npm 11.19.0 and pinned Playwright 1.61.1. Tools lived only in
owned external Ubuntu runner storage; system packages rely on runner teardown.

Four failures are preserved: [initial eight failures](csv-backup-attempt-1.md),
[six passes/two errors](csv-backup-attempt-2.md),
[unchanged third outcome](csv-backup-attempt-3.md), and
[actual delayed-zoom stack](csv-backup-attempt-4.md). Matching earlier error
fingerprints do not retroactively supply their missing stack/URL evidence.
The temporary workflow is retired after retaining this terminal receipt.

Physical touch/system pickers, live map/weather, Auth/accounts, configured Redis
and public management, bank/providers, AI, storage-quota/concurrency stress and
whole-product acceptance remain unverified. No local install/build/browser,
new account, paid service, provider/model call or public trip was involved.
