# Source audit: expense imports and backup round trips

27 October 2026. Historical findings: the two issues below were subsequently repaired; see the [repair receipt](csv-backup-repair.md) for implementation, checks and publication status. The separate asynchronous CSV follow-up below remains open.
Inspected Git revision: `541646a83fcf79ebc4606060070d969cd0216e12`; checkout was clean before this documentation change.

The [product contract](../../../product.md) requires accurate trip costs, CSV expenses without a bank provider, and saved edits between visits.

## Explicit CSV currency is ignored

The live [workspace importer](../../../../components/workspace.tsx) calls [lib/csv.ts](../../../../lib/csv.ts), whose header projection reads only title, amount, date and category.
Source-derived trigger: `title,amount,date,category,currency` followed by `Coffee,100,2026-11-03,food,USD` passes those checks; its amount enters the EUR-only workspace as €100 without conversion or refusal.
The separate `parseExpenseCsv` in [lib/trip.ts](../../../../lib/trip.ts) already rejects an explicitly supplied non-EUR currency, but the UI does not call it.
Proposed narrow remedy: align or consolidate the parsers, reject explicit non-EUR values, and preserve current import limits and existing expenses on failure.

## An exported backup can exceed Restore's limit

[Export and Restore](../../../../components/workspace.tsx) use different size representations: export writes indented JSON, while Restore rejects files above 2,000,000 bytes.
[Durable persistence](../../../../lib/trip.ts) instead validates compact JSON against a 2,000,000-JavaScript-character limit.
Source-derived trigger: a valid compact workspace near that limit gains indentation when exported; Unicode can independently make its UTF-8 bytes exceed its character count. Restore then rejects the app's own backup.
The [earlier import receipt](../10-26/shared-plan-import.md) records a valid 1,999,900-character fixture; this audit did not execute an export of it.
Proposed narrow remedy: share a bounded backup encode/decode contract that round-trips supported workspaces, preserves the durable workspace/40-trip bounds, and validates before replacing current state.

## Evidence boundary

Read-only source inspection established these paths; no CSV import, backup round trip, tests, build, browser, model or provider operation ran for this audit. No production data was read or changed; provider/model cost was zero.
Only this findings document was added during the original audit. `git diff --check` and the untracked-file whitespace check passed; all seven original local file links resolved. The later repair has its own receipt.

## Separate open CSV follow-up

The repair preserves the existing live import API and its state application. A subsequent source review found that its 1,000-expense capacity check uses the render's captured trip before a functional append uses the newer trip. Two pending 15-row reads begun at 980 expenses can both pass their captured check and append 1,010 rows; the unchanged durable validator then refuses that oversized workspace. If the target trip is deleted during a read, its append can also do nothing while the UI announces success. These are source-derived schedules, not executed browser reproductions. Validate the target and capacity against the state actually committed, with accurate post-commit feedback. This follow-up is not fixed or accepted by the currency/backup repair.
