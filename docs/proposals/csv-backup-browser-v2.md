# Hosted CSV and backup browser packet v2

5 November 2026. **Two failed outcomes preserved; map repair prepared.** See the
[first outcome](../results/2026/11-05/csv-backup-attempt-1.md) and
[six-pass/two-fail second outcome](../results/2026/11-05/csv-backup-attempt-2.md).
The owner's standing approval to
continue and complete the personal-project work covers this focused temporary
public CI packet. The [historical proposal](csv-backup-browser.md) remains an
unexecuted source record. The changed candidate gates workspace interaction
with the existing restoration-ready state, preventing early SSR controls from
accepting lost clicks. This is supported by
[Playwright's hydration guidance](https://playwright.dev/docs/navigations#hydration),
but the prior desktop timeout's exact cause remains unproved. No application
dependency changes or repeated unit suites are included.

## Exact acceptance

Use the [v2 browser fixture](csv-backup-browser-v2.spec.ts.example), preserving
the original four scenario bodies and assertions, once in desktop Chromium
(1440 × 1000) and once in touch-enabled narrow Chromium (390 × 844). Require all
eight exact title/profile identities, one worker, no retries, no skipped/flaky
cases, empty global errors, actual Playwright exit zero and boundary receipts.
The cases exercise EUR/USD and ambiguous/blank currency handling, actual CJK
backup download/restore, legacy pretty JSON restore and invalid UTF-8 rejection.
Actual durable workspace hashes, real file choosers, visible UI and reloads are
retained. This is browser-client evidence, not a physical system-picker test.

Each case owns a fresh private browser context and only authored workspace
data. Normal same-origin root/static GETs remain real. API reads, weather and
map tiles and the stylesheet's known Google Fonts requests are blocked and
counted as out-of-scope; no font request is allowed through. Mutations, unexpected external requests,
WebSockets and page errors fail the case. Each root navigation/reload must
observe only the configured deployment ID in the actual HTML. No production
account, personal data, API mutation, booking, EVE/model/provider call or public
publication is exercised. Allowed hosted reads may create ordinary hosting logs.

The first run did not retain actual unexpected URLs or uncaught-error text.
Its Google Fonts interpretation remains source-supported inference. The next
candidate records the first four authored-fixture page errors with 64-byte
names, 384-byte URL-query/fragment-redacted messages and original fingerprints.
Any page error still fails; no error is ignored to pass CJK restoration. All
four original scenario bodies and their assertions remain unchanged. Failed
cases may expose only contained `error-context` file metadata alongside their
boundary receipt; its Markdown contents are not read. Passing cases still
allow no additional attachment.

The second run passed six cases and exposed the same `_leaflet_pos` TypeError
in both CJK cases. The candidate now disconnects the map's owned observer
before removing its captured instance; resize, tile-error and marker callbacks
reject disposed or superseded instances. Controls, map modes and animations are
preserved. Leaflet's
[1.9.4 map lifecycle](https://github.com/Leaflet/Leaflet/blob/v1.9.4/src/map/Map.js#L741)
supports the post-removal access path, but the original caller stack was not
retained. The full eight cases must run again with the same error assertion;
no CJK scenario or feature is reduced to obtain a pass.

## Immutable preparation and one QA run

The inactive [workflow example](csv-backup-browser-v2.workflow.yml.example) runs
only on a push to `qa/trippin-portability-20261105` in public
`alvarovillalbaa/trippin`. It checks out an immutable preparation commit with
read-only contents and no persisted checkout credential. Root publishes that
preparation, waits for its production deployment to be READY, verifies the
canonical public alias and pins **both** `SOURCE_COMMIT` and the newly served
`TRIPPIN_EXPECTED_DEPLOYMENT` in the QA-only active copy. Do not reuse an earlier
deployment ID. Keep the deployment unchanged during the run; do not activate the
temporary workflow on main. Retire it only after terminal evidence is retained.

The [controller](../../scripts/run-csv-backup-browser.mjs) derives a complete
tracked tree/index/working-byte/mode vector, including binary assets, symlink
target text and historical evidence. It checks immutable HEAD, index equality,
all tracked bytes, absence of untracked files and absence of ignored repository
outputs before/after execution. No generated repository path is exempted.

## External tools and cleanup

Use Node 24.21.0 and a standard Ubuntu 24.04 public runner. Install only
`@playwright/test@1.61.1` under a fresh private `RUNNER_TEMP` root using
`--ignore-scripts --no-save --package-lock=false --no-audit --no-fund` and the
public npm registry. Install only Chromium and its Linux system libraries using
that exact tool. These ephemeral runner tools are authorized; no application
dependency, package lock, local installation, build, server, artifact upload or
cache publication is included. Linux system packages are left to runner teardown.

The frontend E2E skill's optional `browserbase-ui-test` helper is not listed in
this session. Its documented fallback installer is
`python3 scripts/install-external-skills.py --skill browserbase-ui-test --agent codex`;
it was not run. This packet needs no Browserbase account. Registry metadata for
Playwright 1.61.1 was re-read on 2026-11-05 and matches the historical integrity.

Tool modules, npm/config/cache, browser binaries, TMPDIR, generated spec,
configuration, downloads and reports remain under the owned external root.
The generated spec changes exactly two relative import specifiers to the pinned
repository's absolute `lib/trip.ts` and `lib/types.ts` paths. A deterministic
canonical transform hash plus exact reversal protects the remaining bytes; the
actual path-dependent generated hash is also recorded. No repository symlink or
application node_modules is created. HOME remains the runner's existing HOME;
explicit npm configuration and XDG paths are private to this packet.

Limits are 12 minutes of work, 90 seconds cleanup, two seconds final stdout and
a 15-minute job; the browser has an eight-minute global timeout. Per-command
streams are capped at 512 KiB each and retained losslessly with hashes and
bounded gzip; raw browser JSON is capped at 2 MiB. The final JSON is capped at
1 MiB. Each child uses an owned process group with TERM, KILL after three seconds
and a further three-second pipe drain. Exit, close, EOF and original-group
absence are explicit. Incomplete drain/process cleanup forbids recursive root
deletion; uncertainty and failed raw reports remain failures.

Identity-checked cleanup removes only the fresh owned external root after all
original groups are gone. During and after browser execution, bounded same-UID
Linux `/proc` scans attribute browser processes by the unique owned binary,
profile/cache path and kernel PID starttime. Before any signal the identity is
rechecked; only positively owned processes may receive TERM/KILL. A final empty
scan is required. Unreadable or uncertain attribution retains the root and fails
cleanup. This is not a global process inventory; system caches remain outside
independent cleanup. Userspace timers cannot
interrupt blocked kernel filesystem calls. No screenshot, trace, video or HTML
artifact is generated. A failure is preserved before any repair or new run.

Preparation checks are source-only syntax/structure/whitespace checks. Local
Storage Guard reported 20.8 GiB free against 34.0 GiB required on 2026-11-05;
no local browser or app execution is
authorized by this document. Passing this packet will not establish provider,
DB/Auth, storage-quota, all concurrency races or complete travel-app acceptance.
