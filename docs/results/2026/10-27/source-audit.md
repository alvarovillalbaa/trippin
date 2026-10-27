# Source audit: expense imports and backup round trips

27 October 2026. **Open findings; neither defect is fixed by this record.**
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
Only this findings document was added. `git diff --check` and the untracked-file whitespace check passed; all seven local file links resolve. Implementation and focused regression checks remain future work.
