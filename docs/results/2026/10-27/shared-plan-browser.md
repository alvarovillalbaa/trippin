# Shared-plan repair: hosted and browser acceptance

27 October 2026. The owner explicitly approved focused desktop/mobile checks using disposable private trips, editing/budget/reload, one-time shared-link import and fixture-only deletion. No bank, account, paid-provider or AI interaction was needed.

## Published source

- Logic repair: `624d815b20f0cb7f9bb3f6cb6d4773b7a0511485`, production deployment `dpl_6w8KLuDEHyyciQeCwXwxqhuE6opb`, `READY` at [trippin-theta.vercel.app](https://trippin-theta.vercel.app).
- The mobile check found an unnamed assistant button when its desktop text was hidden. Adding `aria-label="Ask trippin"` is the only change in follow-up `76c9d8a39ccc5ff98fef4d2d217b436217359cb5`; deployment `dpl_FdDn8TMTQphiM8bXoWmzEfK2NfhH` reached `READY`. Its hosted Next build compiled successfully, TypeScript completed, and the mobile accessibility tree exposed the named button without making an AI request.
- The [20 focused frontend-data checks](../10-26/shared-plan-import.md) passed, as did exact-file syntax parsing, independent source review and whitespace checks. Local app builds and dependency installs stayed stopped under Storage Guard.

## Observed acceptance

| Check | Actual result |
| --- | --- |
| Baseline and owned fixture | The visible workspace initially had three sample trips. Created only `QA shared import · 27 Oct 2026`, using built-in Lisbon; count became four. |
| Editing and budget | Saved 3–4 November 2026 and a €420 budget. Added two authored stops, edited the gallery estimate from €15 to €18, moved the park first, and logged a €12 private food expense. Projected cost showed €114 with the existing daily allowances. |
| Persistence | A real reload retained the fixture, dates, budget and reordered stops. No storage API was read, cleared or edited by the browser check. |
| Sharing and privacy | Generated the actual itinerary link and verified the clipboard matched its visible field. Its decoded snapshot contained both stops and zero expenses/bookings; the private expense text was absent. The imported budget showed €0 recorded while the original still showed its €12 expense. This does not independently prove exclusion of a real booking reference, because none was added in this fixture. |
| One-time import | Opened the generated link with harmless `qa=owned-import&tag=a%20b` query parameters. Exactly one private copy was added: count five. The fragment was consumed after the saved notice; the exact query was preserved. Two subsequent reloads still showed five trips and the same ordered stops. |
| Desktop/mobile | Desktop viewport was restored to 1440 × 756. At 390px, client and scroll widths were both 375px with a desktop scrollbar, so no horizontal overflow was observed. Mobile map/itinerary switching worked; the [map capture](shared-plan-mobile-map.png) visibly shows OSM tiles and the authored pins. [Desktop](shared-plan-desktop.png), [mobile itinerary](shared-plan-mobile.png). These are Chrome viewport checks, not physical-device acceptance. |
| Cleanup | Used only each owned fixture's confirmation checkbox and Delete trip button, guarded by its recorded ID. Count changed five → four → three. A final real reload preserved the original three IDs and original selection, with both fixture IDs absent. No global storage clear or unrelated deletion occurred. The browser was left at the normal home URL and desktop viewport. |

[Machine-readable receipt](shared-plan-browser.json) preserves fixture IDs, counts, query/persistence observations and teardown. The desktop/initial import checks used the logic release; the mobile label was rechecked after the one-attribute follow-up deployment.

The native date fields initially displayed filled values without committing React state through the browser helper. Native keyboard adjustments committed them; the saved and reloaded 3–4 November range was then verified. A first snapshot of the fresh deployment briefly showed its three server-rendered samples; the settled workspace restored all five trips before cleanup. Neither intermediate observation was counted as a persistence pass or used to delete an unverified trip.

## Remaining proof boundaries

Actual 40-trip/serialized-size limits and storage/history failures were not forced in the live browser; the focused data checks cover those boundaries. React StrictMode replay, concurrent browser edits, cross-browser and assistive-technology operation remain unverified. No CSV upload, backup import, provider booking, ticket purchase, configured Redis/community operation, bank linking or EVE model/Workflow turn was performed. Provider credentials remain deferred as requested. This acceptance closes the observed local trip/import path, not the full provider-dependent product or the overall multi-project goal.
