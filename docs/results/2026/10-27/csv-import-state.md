# CSV imports against current workspace state

27 October 2026. Status: source repair published, 86 focused frontend checks passed, and hosted compilation/typecheck and public delivery verified. Browser acceptance remains separate. The multi-project goal is active.

Baseline: [5c427bc13caa7bbf8ba5b47e722ee5908935ce95](https://github.com/alvarovillalbaa/trippin/commit/5c427bc13caa7bbf8ba5b47e722ee5908935ce95). The [owning audit](source-audit.md#separate-csv-follow-up) identified a race against the [product contract](../../../product.md): two 15-row reads begun at 980 expenses could append 1,010, and a read for a deleted trip could announce success without importing.

## Behavior

The [workspace callback](../../../../components/workspace.tsx) submits parsed rows and a captured target identity to the pure [editor reducer](../../../../lib/workspace-state.ts). Every completed read validates the latest target's capacity and the entire proposed workspace using the existing durable serializer before committing any rows. Both files append when they fit; a rejected file preserves all existing rows and newer edits. The import follows its original target when selection changes and uses the current city in its notice.

Ordinary edits retain surviving trip identities. Deletion/recreation of the same ID and whole-workspace replacement invalidate old reads and errors; deleting an unrelated trip preserves a valid pending import. Identity metadata stays outside the portable workspace and has no persisted tombstones. IDs and input generations are generated before dispatch; reducer replay has no storage, notification, random or ref side effects.

Feedback is published after the state update. The existing save effect follows the import notice so a quota failure remains the final warning. Rejected imports retain the workspace reference and do not trigger another save. Input cleanup affects only the latest captured input; it does not discard another valid import or clear a newer selection.

The private workspace schema, both CSV APIs, backup codecs, provider/API/agent code, dependencies, Auth, configuration and active CI are unchanged. No migration or model/provider call is involved.

## Focused evidence

Node 24.21.0 ran these six frontend files together, with **86 passing cases** and exit 0:

```sh
node --test tests/expense-csv.test.mjs tests/workspace-backup.test.mjs tests/workspace-backup-ui.test.mjs tests/shared-plan.test.mjs tests/csv-import-state.test.mjs tests/workspace-state.test.mjs
```

`TRIPPIN_TYPESCRIPT_PATH` selects an existing read-only TypeScript 5.9.3 parser/transpiler for callback extraction. No environment installation is needed. The existing CSV/backup/shared-plan files contribute 58 cases. The new [actual-source callback harness](../../../../tests/csv-import-state.test.mjs) adds 16, and [pure reducer acceptance](../../../../tests/workspace-state.test.mjs) adds 12.

The callback harness extracts the actual import, setter, backup-restore and notification/persistence effect bodies, preserving each render's lexical captures and applying queued updates to the latest state. It controls read completion, inputs, storage and effect scheduling without copying the import implementation or running React or a browser. It covers both capacity completion orders, coalesced updates, additive imports, deleted/recreated and restored targets, unrelated deletion, concurrent edits/selection, complete workspace size, parser/read retry, input cleanup, replay and save-warning order.

The identical final callback file against a small immutable baseline snapshot produced **7 pass / 9 fail**, with no skipped or cancelled cases. It failed the concurrent capacity, deleted/recreated target, complete workspace size, restore/error fencing and input-cleanup schedules. Both completion orders finish before the capacity assertion. These are case outcomes rather than nine distinct defects; no missing new reducer export is counted as a baseline failure. The task snapshot was removed after terminal execution.

| Frozen artifact | SHA-256 |
| --- | --- |
| Baseline workspace component | `3a302388028ca599f93f4f46bc75931d48efdab7f68d190d235383ac93a74ef7` |
| Identical callback test file | `0cd136208d0924fc10bcc7aead1907e153bcc40d568baa128617a1860b29683b` |
| New reducer test file | `c1c50b96397fe02a2cee669c83f4def7a458cdbd926bffb11bf345b252fb2794` |
| Checked reducer | `642f043cf1c9132fa2f0325bce4c92a8400c2deaac8da5df13fbbca3df415e87` |

The new reducer has no legacy counterpart, so its 12 acceptance cases are not presented as baseline sensitivity. Its checks include frozen replay, exact capacity, duplicate expense IDs, same-object replacement, stale errors, full-candidate size and actual persistence/restore without editor metadata.

TypeScript 5.9.3 reported zero semantic diagnostics for the new reducer and its four-library source graph, with no emit. Both changed TypeScript sources and both new test files passed syntax parsing. Independent source review found no scoped blocker in caller compatibility, identity fencing, purity, queued updates or notice ordering. Eight owned text files passed whitespace/newline checks, 29 local Markdown targets/anchors and 18 local imports resolved, and `git diff --check` passed. The existing model, codecs, dependencies, provider/API/agent code, configuration and active CI compare unchanged against baseline.

## Proof limits

These authored in-memory frontend checks do not establish React reconciliation, native file selection/download, real browser quota, desktop/mobile interaction or provider behavior. No user workspace, browser, account, bank, backend, model or provider operation ran for these checks. Full local Next/TypeScript builds were not run. Hosted build proof, when available below, remains distinct from browser acceptance.

The [eight-case browser/temporary-CI proposal](../../../proposals/csv-backup-browser.md) remains inactive pending its existing approval request. This change does not activate it or expand its resource scope. Existing credential, public/community persistence, bank and identity prerequisites remain outstanding.

## Final readback

Source [89b587fbc6dfb45fb12ba1addd80cbc2c33ec36d](https://github.com/alvarovillalbaa/trippin/commit/89b587fbc6dfb45fb12ba1addd80cbc2c33ec36d) was pushed to personal-repository `main`. An immutable connected GitHub read of `lib/workspace-state.ts` returned blob `f7134ab935c60b0dafb1f95c50d4e6e4a1a7d4f4`, equal to the local blob.

Vercel production deployment `dpl_CWdk84gCNq7Ag8D2CvMLXPeWzk8d` reached `READY` at that exact SHA and included the canonical Trippin alias. Logs show successful compilation, completed TypeScript checking, build completion and deployment completion. A connected GET of [the public app](https://trippin-theta.vercel.app/) returned 200 and identified that exact deployment. These are hosted build/delivery results, with no browser or provider acceptance claim. A documentation-only follow-up retains the checked runtime and test bytes.
