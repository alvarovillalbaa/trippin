# Proposed CSV and backup browser acceptance

Status: **inactive; not executed**. These three proposal files do not activate a workflow, add a repository dependency, install a tool, or run a browser. The supplied AGENTS.md §7 browser gate and §14 CI/dependency gate require new Trippin-specific approval. The repository's [instructions](../../AGENTS.md) and [product contract](../product.md) also apply.

The proposal is one manually dispatched, temporary GitHub Actions run against **https://trippin-theta.vercel.app**. Dispatch requires the READY deployment ID currently served by that public alias. It uses a fresh Chromium context for each case with only authored private browser data. No existing user session, account, provider credential, model call, server write, publication, or real booking is used.

## Exact scope

[Browser source](csv-backup-browser.spec.ts.example) defines four scenarios. The [workflow example](csv-backup-ci.yml.example) runs each in desktop Chromium at 1440 × 1000 and Chromium mobile emulation at 390 × 844 with touch enabled: **eight cases**, one worker, zero retries.

| Scenario | Actual browser evidence required |
| --- | --- |
| EUR accepted; USD rejected | Import one mixed-case EUR row through the real CSV chooser; preserve the existing expense; reject explicit USD without modifying the accepted durable workspace or visible rows; reload and retain both accepted rows. |
| Ambiguous/blank currency rejected | Reject duplicate `currency` columns containing EUR/USD and a declared blank currency; retain the original expense and complete durable workspace. |
| CJK export/restore | Seed a valid private workspace whose compact JSON is below the two-million-character workspace bound but whose UTF-8 download exceeds two million bytes. Obtain the actual browser download, verify its complete content and ordinary filename, edit the profile through the UI, restore the downloaded bytes through the real chooser, then reload and verify the full saved model and visible profile/selection. |
| Legacy/invalid encoding | Restore an indented, model-valid legacy file larger than two million bytes. Reject invalid UTF-8 embedded in otherwise model-valid JSON; retain the full previous durable model and visible profile/selection, including after reload. |

The nine-trip/sixty-stop large fixtures contain only authored data and use the actual `isWorkspace` validator. Their construction is test data, not a replacement parser. The browser source imports only `lib/trip.ts` and its pure data/type imports; no backend module runs in the test process. Full-workspace hashes keep multi-megabyte payloads out of failed assertion logs. File uploads exercise the actual buttons, file chooser, hidden inputs, and DOM handlers. Playwright controls the CI chooser; this is not physical-device or macOS system-picker proof.

The fixtures enter a fresh context through Playwright `storageState`, once, before navigation. Reloads do not reseed them. There is no application-global patch, React mock, production data read, local-storage clearing, or alternate parser. Context teardown deletes its storage and browser downloads. Authored upload buffers stay in the runner process; none is sent to the server. Test output and the JSON report remain in disposable runner storage, with no artifact upload, cache, screenshot, video, trace, or HTML report.

## Network boundary

The browser guard is installed before navigation. It leaves normal **GET/HEAD requests for the exact app origin's root and static assets** intact. All app-origin `/api` and `/api/*` GET/HEAD reads are aborted as named out-of-scope requests and counted in a bounded summary; no configuration, public directory, or bank-readiness response is read or accepted. Bank/provider readiness may show an explicit failed/unavailable state because those requests are blocked; no success fixture substitutes for the real response. Every HTTP mutation, including an API POST, is blocked and fails the case. The existing Open-Meteo forecast and OpenStreetMap tile GETs are also aborted as explicit out-of-scope dependencies; weather and map availability are not accepted by this run. Any other cross-origin request is blocked and fails the case. No private app globals or fetch/provider settings are replaced. No assistant, provider search, bank connection, public sharing, or community mutation control is used.

The required dispatch string `deployment_id` enters the job only as `TRIPPIN_EXPECTED_DEPLOYMENT`; no user input is interpolated into shell or JavaScript source. Preflight and browser discovery both require `^dpl_[A-Za-z0-9]+$`. On initial navigation and every reload, the browser inspects the actual root HTTP response body and requires its unique deployment IDs to equal only the expected ID. Missing, mixed, or changed IDs fail the existing case without another request or additional test. These checks use public HTML, not application-private globals.

Hosted GETs still reach Vercel and may generate ordinary hosting logs. A browser pass establishes the eight scoped client behaviors against the deployment actually served during the run. It does not establish DB/Auth/SMTP, provider accuracy, network concurrency, every restore race, storage-quota behavior, or a complete product release. The [actual-callback unit harness](../../tests/workspace-backup-ui.test.mjs), [codec checks](../../tests/workspace-backup.test.mjs), and [CSV checks](../../tests/expense-csv.test.mjs) cover separate frontend boundaries and are not rerun by this workflow.

## Tool and cost boundary

Registry metadata was read on 2026-10-27 with `npm view @playwright/test@1.61.1 version dist.integrity dist.tarball --json`; no install occurred. The primary source is the [versioned npm registry record](https://registry.npmjs.org/@playwright%2ftest/1.61.1):

```text
version: 1.61.1
tarball: https://registry.npmjs.org/@playwright/test/-/test-1.61.1.tgz
integrity: sha512-8nKv6+0RJSL9FE4jYOEGXnPeM/Hg12qZpmqzZjRh3qM0Y7c3z1mrOTfFLids72RDQYVh9WpLEfR5WdpNX4fkig==
```

The example pins checkout/setup-node to full reviewed action commits, Node 24.21.0, and Playwright 1.61.1. Trippin has no committed package lock; the workflow therefore installs **no application dependencies**. It installs Playwright only under a new `RUNNER_TEMP` prefix with lifecycle scripts disabled and no saved manifest or lock. One absent-only `node_modules/@playwright/test` symlink exposes that runner-owned package for TypeScript test loading. A separate approved step installs only Chromium and its Linux system libraries. There is no local build, dev server, migration, service provisioning, account enrollment, paid API, or stored secret.

The optional Browserbase UI-test helper is unavailable in this session. The frontend E2E skill advertises `python3 scripts/install-external-skills.py --skill browserbase-ui-test --agent codex`; that installer was **not run**. This temporary Playwright proposal requires no Browserbase account or service.

The job runs only for public `alvarovillalbaa/trippin`, on `main`, by `workflow_dispatch`, on the standard `ubuntu-24.04` runner. It has `contents: read`, no stored checkout credential, no package cache, a 15-minute job limit and eight-minute browser-suite limit. GitHub documents free Actions use for public repositories on standard hosted runners; the job refuses a private-repository run. See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) and [Playwright's CI setup](https://playwright.dev/docs/ci-intro).

## Review and activation after approval

Approval would authorize this exact temporary CI/browser/tool scope. It would not authorize broader browser suites, model calls, product or provider configuration changes, or repository dependency changes.

1. After approval, copy the reviewed workflow example to `.github/workflows/csv-backup-browser.yml` on the default `main` branch and publish that workflow. GitHub requires a dispatch workflow to exist on the default branch; copying it only onto a new feature branch is insufficient. There are no push, PR, or scheduled CI triggers. See [manual workflow rules](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
2. Publishing the temporary workflow on `main` also triggers the repository's automatic Vercel production deployment. Wait for that new deployment to be READY, read the actual public alias, and record the source commit and deployment ID it serves. Do not reuse an earlier repair deployment ID. Make no further publication while the eight browser cases run.
3. Manually dispatch once on `main` with `deployment_id` set to that READY, publicly served ID. The workflow copies only this reviewed browser example to `tests/proposals/csv-backup-browser.spec.ts` inside the disposable runner. It logs exact source hashes, checks deployment identity on every root navigation/reload, and requires eight passing results, four per profile, with no skipped/flaky/retried cases.
4. Inspect the run ID, job conclusion, all eight case outcomes and any network-boundary failure. Record those bounded results with the actual deployment identity. A failed or timed-out run is not acceptance and is not automatically retried.
5. Remove the temporary active workflow only after the run is terminal and its receipt is recorded. That removal may trigger another automatic Vercel deployment after acceptance has finished. Keep these inactive examples and the outcome receipt. Runner teardown removes tools, browsers, copied test/configuration, downloads, fixtures and reports.

No command in this proposal has been executed beyond metadata reads and source-only syntax/link/whitespace checks. The browser/download APIs follow the official [file-input guide](https://playwright.dev/docs/input), [Download API](https://playwright.dev/docs/api/class-download), and [network-routing guide](https://playwright.dev/docs/network).

Preparation checks on 2026-10-27 passed: YAML parsing, required deployment-input/environment wiring, AST verification that all four root navigation/reload sites check their response, seven Bash snippets parsed with `bash -n`, four embedded Node scripts parsed without execution, two TypeScript sources parsed (the browser example and generated configuration), four scenario definitions/two configured projects, seven local Markdown link targets, final newlines/trailing whitespace, and `git diff --check`. Browser execution and fixture/model imports remain unrun; syntax checks do not establish acceptance.
