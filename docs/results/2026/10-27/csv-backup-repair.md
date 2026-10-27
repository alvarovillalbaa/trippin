# CSV currency and backup integrity

Status: source repair published, 58 focused checks passed, hosted compilation/typecheck and public delivery verified. Browser file selection/download and provider acceptance remain separate. The full multi-project goal is active.

Baseline: [56121aa4fcd9f24f35202a03aa35b76bb19c1a72](https://github.com/alvarovillalbaa/trippin/commit/56121aa4fcd9f24f35202a03aa35b76bb19c1a72). The [owning audit](source-audit.md) identified the two original defects against the [product contract](../../../product.md).

## Behavior

- The live CSV importer previously ignored `currency`, so USD100 could enter the EUR-only budget as €100. It now requires trimmed case-insensitive EUR when that column exists, rejects blank/foreign values and ambiguous duplicate currency columns, and validates field count for declared-currency rows. The legacy parser also rejects duplicate currency headers. The two APIs keep their different formats, limits, defaults, ID generation and category/amount policies. Currency-free template behavior is retained. No exchange rate or conversion is invented.
- New backup exports use compact JSON. A supported workspace retains the existing structural model, 40-trip bound and 2,000,000 compact JavaScript-character limit. Its UTF-8 export therefore fits within 6,000,000 bytes, including CJK. Restore uses a separate 16 MiB raw-file envelope, fatal UTF-8 decoding, existing model validation and the same compact limit. Older indented backups within that envelope are validated by their compact size. Arbitrary whitespace-expanded files remain bounded.
- Oversized or structurally unsupported in-memory data can still be archived. Export does not call the durable serializer as a hard gate: it prepares `trippin-recovery.json` and explains that repair or a smaller workspace is needed before whole-workspace restoration. Ordinary supported exports remain `trippin-backup.json`. Private fields and accepted extensions are retained; public-sharing projection is not used.
- Restore commits through the actual persistence helper before replacing UI state or announcing success. File, UTF-8, model, size and storage failures keep the current UI and durable workspace. It captures the input before awaiting and resets the latest input for reselection. A generation guard ignores superseded read success/errors and cannot clear a newer selection. This is stale-result suppression, not cancellation of file reads.

No dependency, model/transport schema, Auth, provider, server/API, active CI or production-configuration change is part of this repair.

## Focused checks

Node **24.21.0** executed the actual TypeScript data modules through its native type-stripping loader. The callback adapter uses an existing read-only TypeScript **5.9.3** parser/transpiler to extract the actual inline JSX handlers; it supplies controlled input/storage/download/state boundaries and the real trip codecs/validators/persistence functions. It neither copies the handler logic nor executes React, DOM or a browser.

| Scope | Cases | Passing |
| --- | ---: | ---: |
| Both actual CSV APIs | 14 | 14 |
| New backup codec acceptance | 12 | 12 |
| Actual export/restore callbacks | 12 | 12 |
| Existing shared-plan/persistence regressions | 20 | 20 |
| Total | 58 | 58 |

No skips, retries or assertions were removed. With identical final harness bytes, a small task-owned snapshot of immutable baseline source produced **9 pass / 5 fail** for CSV and **0 pass / 12 fail** for callbacks. These are acceptance-case outcomes, not 17 distinct defects: several callbacks also assert newly added durability/reset behavior. The new codec exports did not exist at baseline, so their twelve acceptance cases are not reported as before/after regression sensitivity. An intermediate implementation before the restore generation guard passed ten callback cases and failed the two ordering cases. All temporary baseline copies were removed after terminal execution.

Coverage includes declared-currency ambiguity, late invalid rows, accepted existing formats, all 40 trips/private records/extensions, exact 2,000,000-character CJK data, Unicode controls and escaped surrogates, older pretty JSON above 2 MB, optional BOM, raw-file boundary, invalid data, recovery export, failed reads/storage, actual persistence before UI replacement, repeated selection, released event target, and overlapping restore outcomes.

```sh
node --test tests/expense-csv.test.mjs tests/workspace-backup.test.mjs tests/workspace-backup-ui.test.mjs tests/shared-plan.test.mjs
```

`TRIPPIN_TYPESCRIPT_PATH` selects a compatible existing compiler for the callback adapter. `TRIPPIN_WORKSPACE_SOURCE` selects a source snapshot for handler sensitivity. Tests use authored in-memory data; no user workspace, browser, backend, account, bank, provider or model operation ran. Node's normal typeless-package warning was visible; no package/module setting was changed to suppress it.

Independent source reviews checked currency compatibility and backup/ordering contracts; no remaining scoped must-fix was found. All nine owned text files passed whitespace/newline checks, all three test sources passed Node syntax checks, seventeen local Markdown targets and eighteen local imports resolved, and the three changed TypeScript sources passed TypeScript 5.9.3 syntax parsing. `git diff --check` passed. Dependencies, transport types, API/agent code, Vercel configuration and active CI compare unchanged against the baseline. This is not a local TypeScript program check or build; exact source/hosted publication results are recorded below after completion.

## Remaining acceptance

The AST adapter does not prove React reconciliation, native `File`/download APIs, actual browser quota or desktop/mobile interaction. Existing earlier browser evidence retains its original shared-plan/editing scope. The [prepared eight-case browser/temporary-CI proposal](../../../proposals/csv-backup-browser.md) remains inactive pending explicit approval. Provider credentials, EVE model execution, public/community persistence, bank and identity requirements retain their existing gates.

The [separate CSV target/capacity race](source-audit.md#separate-csv-follow-up) was outside this repair and has since received its own [state repair and focused evidence](csv-import-state.md). That later receipt owns its publication status and proof limits. No full-goal completion claim is made.

## Publication

Source [11206ac303c1aecd93313b4fac5d2ae791948542](https://github.com/alvarovillalbaa/trippin/commit/11206ac303c1aecd93313b4fac5d2ae791948542) matched the remote `main` readback. An immutable connected read of the live CSV parser returned Git blob `5890729f2d7627e56f6f9ad71ffad57756649ae3`, equal to the local blob.

Production deployment `dpl_59bTcEqmKr9gW2ogWkjjVeTEqMEY` reached `READY` at that exact SHA with the canonical Trippin alias. Build logs show successful compilation, completed TypeScript checking, Node.js 24 runtime, build completion and deployment completion. A connected HTTP fetch of [the public app](https://trippin-theta.vercel.app/) returned 200 and identified that deployment. This is hosted build/delivery proof, not browser file-flow acceptance or provider execution. A documentation-only follow-up retains the checked runtime/test bytes.
