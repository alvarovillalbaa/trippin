# Linked wallet — first failed attempt

**Failed: W01 and W02 are not accepted.** Both profiles captured one baseline,
then stopped at the same scoped select locator. The remaining twenty snapshots
and all reservation/expense mutation-and-reload checks were unvisited.
See the [prepared contract](../../../proposals/linked-wallet-checks.md).

- [Run 42367093341](https://github.com/alvarovillalbaa/trippin/actions/runs/42367093341),
  job 128387324014, workflow 410271501, create event, attempt 1.
- Job: 7 November 2026, 11:11:03–11:12:01 UTC, failure.
  Controller: 11:11:10.300–11:11:59.755 UTC, failed with `browser_case_status`.
- Tested preparation `9dd1cd9329dad522794fd3c402734960493271be`;
  activation `ee94fa72b9bbc71191890d8cb2e521399c1d38ab`.
- Runtime base `ac01586f10a0f1ff8609c00ee43300c57249a012`;
  canonical alias https://trippin-theta.vercel.app;
  expected deployment `dpl_BASnM5VtYvhPWUKnW4hcE5VDhodd`.
  Root separately refreshed READY/production/source metadata at 11:10:05 UTC.
- Only the owned workflow was disabled; fresh API readback reported
  `disabled_manually`, updated 11:12:31 UTC.

The [single-read original job log](linked-wallet-attempt-1.log) was saved before
parsing, followed by the [byte-exact emitted JSON](linked-wallet-attempt-1.json).
The unique log payload reproduces the JSON file including its final newline.

| Original | Bytes | SHA256 |
| --- | ---: | --- |
| JSON | 183,343 | `ab744a37a1212c4e57ebbf14d48de41f9cf1e3666e010e846810daf109da7454` |
| Job log | 202,833 | `57f3e850a1153e10eb7fe5029702e07c9f97de1c6528d54e7e5489891e87bb6b` |

W01 desktop 1440×1000 and W02 narrow touch-emulated 390×844 both report
`browser_check_failed` / TimeoutError after 10,000 ms in
`getByRole('dialog', { name: 'Keep the details close.', exact: true }).getByLabel('Reservation type', { exact: true })`.
The retained composite locator wait does not prove which sublocator was absent;
there is no dialog DOM/count snapshot or action-completion journal. No cause or
product defect is established by this receipt, and no timeout/network gate was waived.

Both original baseline workspaces decode and agree exactly: known private demo
trips, two demo reservations, no expenses, and EUR 687 projected (453 reservations,
42 admissions, 152 food and 40 transport), budget 850, recorded zero. Only these
two of the planned 22 originals exist: 28,724 raw / 8,346 gzip bytes. No captured
new booking/expense ID, edit, transfer, deletion, reload or final-restoration proof
exists. Each profile made one 200 root navigation with the sole expected DPL ID;
HTML bodies are not retained and no compiled-asset/source equivalence is claimed.

All 73 retained gzip records verify: 183,369 decoded / 66,552 compressed bytes.
They include 68 command streams (129,279 / 48,852), two tool-state records, a
22,429-byte browser-output copy and two workspace originals. Browser-output and
resolved-tree copies equal their respective command stdout; copies are not extra
executions. The original driver output equals the stored parsed failure result.
All 34 commands were reaped with complete original streams, closed pipes and
absent groups; 33 exited zero and the browser driver exited one, without signals.
Outer process cleanup passed; `allForegroundCommandsNormal` correctly stayed false.

The frozen isolated lock, registry-only integrity fields and exact Playwright
1.61.1 chain verify; generation and npm ci disabled lifecycle scripts. Node
24.21.0 and Chromium 149.0.7827.55 were observed. No application dependency,
build or server was installed/run. Known API/weather/tile/font blocks were
4/1/15/1 on desktop and 4/1/1/1 on narrow; all fatal request, HTTP, page-error,
crash, WebSocket, route, mutation, extra-page and download counters were zero.

All 110 source bodies / 4,401,070 bytes were independently rehashed and bound to
immutable tree `707445e83f15e693150d2159f0d67e07616ed171` modes/blob IDs/sizes.
Four full Git/index/native guards share
`9e19bc531f4de06c5f55a1e7a603b795f8560f3ed3bc8f780dc4fd96cada8929`.
Both documentation prefixes remain exact; 104 prior blobs are unchanged and four
paths added. The copied driver matches `9d94db0dedc896b4add6fbb46791b172474088ab37bbe5552cda70e5cec57dcc`.
Full wallet validation did not complete. Post-browser installed-tool/lock checks,
the copied-driver rehash and the fifth `after_browser` guard were not reached.

Two contexts and pages closed normally, with expected browser disconnect,
zero pending jobs/requests/contexts and no cleanup failures. Eight attributed
PID/starttime observations were gone, with zero uncertainty or supervisory
signals; this is not a host-wide process count. Owned scratch removal passed.
The earliest-step 15-minute clamp retained 720 seconds work, 90 cleanup and
30 margin. Linux system-library disposal relies on the ephemeral runner.

The failed result remains false. Earlier accepted scopes were not rerun.
This partial Tier 2 client observation proves no wallet lifecycle, backend,
provider, model, account, purchase, real reservation, physical-device or full
product acceptance. No retry, source repair, local heavy operation or Git
publication/retirement was performed by the monitoring agent.
