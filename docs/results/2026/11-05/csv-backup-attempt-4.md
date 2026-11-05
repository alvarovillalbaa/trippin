# Fourth hosted portability run: delayed zoom callback identified

5 November 2026. Source `f6218b6ffe9647ac8d3e31370fb59d18cf16b219`,
tree `db3cbc8845e1d6a9796d5ef2f7f575201acf8768`, ran against READY
`dpl_5YB2TkWhVLZiwifkRUTFgVJeQ6Ev`, verified in actual public-alias HTML.
[Run 41965022261](https://github.com/alvarovillalbaa/trippin/actions/runs/41965022261),
job `127039944498`: controller **04:00:14.139–04:01:04.643 UTC**;
job **04:00:06–04:01:06 UTC**, failure.

All eight cases ran once, retry zero: six pass and the same two CJK failures;
no skipped/flaky cases or global errors. Both errors occur with one root
navigation observed. Actual bounded public-asset frames identify
`DomUtil.getPosition ← _getMapPanePos ← _getNewPixelOrigin ← _move ← _onZoomTransitionEnd`.
The public Leaflet chunk was independently read and hashed; path, exact columns,
byte size and hash are retained in the [full receipt](csv-backup-attempt-4.json).
This identifies the callback for this run. Earlier matching fingerprints do
not retroactively supply missing stacks for those runs.

All 14 root responses returned 200 with the pinned unique deployment. Known
fonts stayed blocked; unexpected reads, mutations and WebSockets were zero.
Four full guards protected 92 files/3,039,652 bytes. All 28 command groups
were reaped, closed at EOF and absent; only browser CLI exited 1. Owned browser
processes were absent after execution, no supplemental signals or uncertain
attribution occurred, and scratch cleanup passed. No repository outputs were
ignored/exempted. No app code or original scenario body changed in this run.
Full eight-case acceptance remains pending; the page-error gate stays intact.
