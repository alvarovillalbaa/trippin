# Second hosted portability run: six pass, two Leaflet errors

5 November 2026. Preserved before the map lifecycle repair.

Source `5b305c46db49944d27280a2c1303e4548758baaa`, tree
`49af9bfabb3e6a9649b7264e3e4d12a018b0b735`, ran against
`dpl_2A9Jf5dmqyfGTH7s7f6AD11by1pt`, verified READY and actually served by the
public alias. [Run 41962755508](https://github.com/alvarovillalbaa/trippin/actions/runs/41962755508),
job `127032701084`, failed. Controller:
**03:37:37.169–03:38:32.582 UTC**; job **03:37:29–03:38:35 UTC**.

All eight exact title/profile pairs ran once with retry zero. The actual
Playwright report records **six passes and two failures**, no skipped/flaky or
global errors. EUR/USD and ambiguous/blank currency checks passed in both
profiles, as did legacy restore/invalid UTF-8 and its reload/Profile step. This
improves the observed result after the readiness gate; the earlier desktop
failure's exact timing remains unproved.

Both CJK cases completed their data assertions but failed the uncaught-error
guard with `TypeError: Cannot read properties of undefined (reading '_leaflet_pos')`.
Its fingerprint matches the first run. The new bounded diagnostics now expose
the name/message, not a precise callback stack. A source-supported hypothesis
is map access after its pane has been removed; do not relabel either case a
pass or disable its error check. The [raw receipt](csv-backup-attempt-2.json)
retains all boundaries and full Playwright JSON.

All **14 root observations** returned HTTP 200 with the pinned unique deployment
ID. Known font loads were actually observed and blocked, with zero unexpected
reads, mutations or WebSockets. API/weather/tile reads stayed blocked. Fonts,
weather and map availability are not accepted. The first run's exact unexpected
URLs remain unrecorded rather than retroactively assigned.

Four full guards protected **88 files/2,700,560 bytes**. All 28 supervised
command groups were reaped/closed at pipe EOF and absent; only the browser CLI
exited 1. All 35 attributed same-UID processes disappeared without cleanup
signals; final scan was empty and owned scratch cleanup passed. Repository
ignored/untracked output stayed empty. Failed-only Markdown diagnostic
attachments were metadata-validated and their contents were not read/retained.
No case body, fixture construction or original assertion was removed. No local
install/build/browser, account, provider/model, server mutation or public trip
was involved. Whole-app and full eight-case acceptance remain unfinished.
