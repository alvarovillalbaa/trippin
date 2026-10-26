# Shared itinerary import repair

26 October 2026. Source and pure frontend-data checks; no browser or provider actions.

The previous `#plan` mount handler appended a copy on every reload and bypassed the 40-trip limit. At 40 existing trips it could save 41; the next restore would reject that workspace and fall back to the sample. This failure path was identified by source inspection, not by changing anyone's saved browser data.

The shared-plan helper now validates the incoming itinerary before creating a private copy, checks the 40-trip limit and the restore contract's 2,000,000-character serialized limit, and returns the original workspace for invalid/full imports. A ref guards initialization during React StrictMode effect replay.

Persistence validates the complete workspace before overwriting durable data. Only a successful storage write permits removal of the accepted plan's fragment, using `replaceState` with the existing history state and current path/query. Failed writes keep the imported trip in memory and retain the incoming link, with an explicit unsaved notice; a later successful write can retry consumption. If history replacement fails after saving, the UI says the trip was saved and explains how to avoid importing again before reload.

## Checks

- Installed Node **24.21.0**, `node --test tests/shared-plan.test.mjs`: **20 passed, 0 failed**.
- Cases cover valid UTF-8 content; stripping bookings, expenses, companions and requests; input immutability; exact path/query preservation; unrelated fragments; malformed base64/JSON/UTF-8, incomplete and oversized plans; a full 40-trip workspace; 39 → 40; actual restore validation; and reload using the consumed URL.
- A valid **1,999,900-character** saved fixture rejects an import that would cross the restore limit. Callback checks cover failed write/no URL consumption, successful write-before-consumption, retry, history failure, and refusal to overwrite durable data with invalid or oversized state.
- The tests run the real TypeScript data module and validators through Node's native TypeScript loader. A test-only resolution hook supplies the extension that Next normally resolves; no dependencies were installed.
- Exact-file TS/TSX syntax parsing and `git diff --check` passed.
- An independent source reread identified the serialized-size and premature URL-consumption paths during implementation. Both were corrected before publication. Its final scoped reread found no remaining concrete issue in initialization, persistence, retry or history handling; this is source review rather than browser acceptance.

## Limits

Storage/history failures are simulated through the actual frontend persistence helper's callbacks. These checks do not exercise browser history, React StrictMode mounting, real browser quota failures, or UI interaction. The initialization guard and history-state argument were source-reviewed. No broad typecheck, local app build, dev server, backend test, credentials, auth/provider configuration, or deployment was performed for this repair. Earlier production/build evidence remains scoped to its recorded revision until publication and verification of this change.
