# First hosted portability run: eight failures preserved

5 November 2026. Recorded before candidate or fixture repair.

Checked source `ce2d5ce323637ea8ec1a9b0bc47050d74a130551`, tree
`b07a868a44a55d47a6b97bf89994c80490a1c9a1`, ran against READY production
`dpl_G7sgQFFuK3SKay39ZDYQgjPh6voC`, mapped to that commit and confirmed in
anonymous public HTML before activation. [Run 41961025343](https://github.com/alvarovillalbaa/trippin/actions/runs/41961025343),
job `127027148636`, completed with failure. Controller interval:
**03:21:08.420–03:22:32.226 UTC**; job: **03:20:59–03:22:33 UTC**.

Actual Playwright statistics were **zero accepted, eight unexpected**, with
zero retries/skips/flaky/global errors. Every case recorded one or two blocked
unexpected reads; all 14 root responses were HTTP 200 with the expected unique
deployment ID. The exact blocked URLs were not retained. The stylesheet's
Google Fonts import is a source-supported candidate, not proof of those URLs.
Both CJK cases also recorded one uncaught page-error fingerprint; its original
name/message is unobserved. The desktop legacy case additionally timed out
showing the Profile form after reload. Its exact timing/cause is not proved.
No case is relabeled a pass because its data assertions reached a later step.

The [raw JSON receipt](csv-backup-attempt-1.json) preserves command streams,
full Playwright JSON and all eight inline boundary attachments. Playwright
added default `error-context` Markdown metadata to failed cases, so the first
parser's one-attachment check rejected boundary extraction. The inline bodies
are decoded separately in the receipt; temporary error-context contents were
not retained. A later diagnostic correction must not weaken passing-case
criteria or omit any original scenario body.

Four complete guards protected **86 tracked files/2,509,306 bytes**, including
binary assets. All 28 supervised commands were reaped/closed with both pipes at
EOF and original groups absent; only `browser_cases` exited 1. All 60 observed,
root-attributed same-UID processes disappeared without supplementary signals;
final browser scan was empty and owned scratch cleanup passed. The historical
process-display field may include a bounded Chromium role-flag prefix; it is
not a full argv/environment capture. Repository ignored/untracked output was
empty. Linux system packages remain the disposable runner's teardown concern.

Node 24.21.0, npm 11.19.0 and all three Playwright packages at 1.61.1 were
observed. The installer reported Chrome Headless Shell 149.0.7827.55/revision
1228. No application dependencies, local browser, account, API mutation,
provider/model, bank connection or public trip was used. This failed packet
establishes no successful CSV/backup browser acceptance.
