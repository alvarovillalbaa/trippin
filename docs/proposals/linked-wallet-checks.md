# Linked manual wallet: source and check contract

Preparation contract, 7 November 2026. No accepted result is claimed yet.
The owner's standing autonomous-work/check approval covers W01 desktop
1440 × 1000 and W02 narrow 390 × 844 with supported touch emulation, once each,
sequentially and without retries. Git source is
`ac01586f10a0f1ff8609c00ee43300c57249a012`, tree
`9b314bc812971ca01e78cf763b87df1213df3659` (106 blobs / 4,294,971 bytes).
No application change is proposed. Earlier core, CSV/backup, zoom and L01/L02
journeys stay closed.

## Owning contract and evidence gap

[Product](../product.md) requires projected costs without
double-counting linked reservations. [Acceptance](../acceptance.md)
leaves linked booking reconciliation and wallet browser save unverified. The
[earlier browser receipt](../results/2026/10-27/shared-plan-browser.md)
logged an unlinked expense and explicitly added no real booking reference.
The deployment record classifies reservation reconciliation as source review.

Owners are [Booking/Expense types](../../lib/types.ts),
[wallet actions and forms](../../components/workspace.tsx)
(`submitBooking`, `submitExpense`, `removeBooking`) and
[`getTripCost`](../../lib/trip.ts). The native
[dialog](../../components/dialog.tsx) is named by its heading.
These links are relative to the owning repository; the SHA above fixes the
reviewed application source.

## Authored fixture and real controls

Use a fresh private context and the built-in Munich sample, selected through
`Choose your trip` if needed. Before retaining storage, require its three known
private sample trip IDs, profile Alex Morgan and selected `trip-munich`.
The chosen admission is `m2-art`, **Get a little lost in modern art**: planned,
culture, EUR 12, day `munich-day-2`. Do not change any itinerary activity.

Navigate through visible **Bookings** / **Trip budget** buttons in
**Main navigation**. On the itinerary, the real `.trip-summary` buttons also
expose **ALL THE LITTLE DETAILS … saved reservations** and
**WHOLE-TRIP ESTIMATE … budget**. A reload returns to the itinerary; reopen the
needed view through these controls rather than assuming view persistence.

- Click **Save reservation**. Scope fields to dialog **Keep the details close.**:
  **Reservation type** = Event (`event`), **Status** = Reserved (`reserved`),
  **Title** = `QA authored gallery reservation`, **Date** = `2026-10-23`,
  **Total cost (€)** = `20`, **Booking reference** = `AUTHORED-LOCAL`,
  **Replaces an itinerary cost?** = the chosen activity (`m2-art`). Leave
  **Booking or ticket URL** blank; set **Anything else?** to
  `Authored check only; no reservation or purchase.` Submit the dialog's
  **Save reservation** button. Capture the new booking ID only from read-only
  stored state, binding it to these exact fields and the appended third row.
- Use **Edit booking QA authored gallery reservation**, change only
  **Total cost (€)** to `24`, then submit. Require the same booking ID, position,
  source `custom`, linked activity and every other booking field.
- From **Trip budget**, click **Log expense**. Scope fields to dialog
  **A little expense.**: **What was it?** = `QA authored gallery payment`,
  **Amount (€)** = `18`, **Date** = `2026-10-23`, **Category** = culture,
  **Replaces a planned cost?** =
  `Reservation · QA authored gallery reservation` (`booking:<captured ID>`).
  Submit its **Log expense** button. Bind the new expense ID; require
  `bookingId` equal to that booking and no `activityId`.
- Use **Remove booking QA authored gallery reservation**. Require only that
  booking to disappear. The same expense must retain all other fields and its
  ID, lose `bookingId` and gain `activityId: m2-art`.
- Use **Delete expense QA authored gallery payment**. Require only that expense
  to disappear. Expense editing is not implemented or part of this contract.

## Independent cost and durable-state expectations

Amounts are EUR sample estimates. The original flight/stay sum is 453; other
non-food/transport admissions total 42. Four-day food/transport floors remain
152 + 40 = 192. Linking the culture activity avoids those floors hiding errors.

| State | Reservations | Expenses | Flights/stays/tickets | Things to do | Total | Recorded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 2 | 0 | 453 | 42 | 687 | 0 |
| Save linked 20 | 3 | 0 | 473 | 30 | 695 | 0 |
| Edit same booking to 24 | 3 | 0 | 477 | 30 | 699 | 0 |
| Log linked actual 18 | 3 | 1 | 471 | 30 | 693 | 18 |
| Remove booking; actual follows activity | 2 | 1 | 453 | 48 | 693 | 18 |
| Delete actual | 2 | 0 | 453 | 42 | 687 | 0 |

**Food & daily travel** stays 192; **Other expenses** stays zero. Check visible
`.budget-banner` projected total/budget 850, the named `.budget-breakdown` rows,
and **What you’ve actually spent.** recorded amount. The wallet must show the
authored title/reference/cost before removal. Never click external detail links.

Observe a baseline and each of the five mutations before and after a real
reload: eleven whole-workspace originals from `trippin.workspace.v1`, read-only.
Each reload must reproduce the preceding stored bytes and visible totals. Build
expected state independently from the guarded baseline plus only the specified
booking/expense changes; do not call app serializers or cost helpers. Preserve
all original trip/activity/booking IDs, order, activity fields, other trips,
profile, budget, dates, selection and unrelated workspace fields. Original demo
bookings stay byte-equivalent. Final whole-workspace bytes must equal baseline.

## Source, execution and proof boundaries

This is Tier 2 focused browser-client integration, using ordinary UI and owned
private browser persistence. It creates no valid booking, purchase, account,
bank connection, provider quote or server record. Known API/weather/tile/font
reads must be blocked/countable; unknown reads, mutations, WebSockets, admitted
request failures and page errors/crashes remain fatal. Use a freshly verified
READY source/deployment pin and actual root-HTML deployment observations, without
claiming compiled-asset equivalence. No storage seeding, app-internal calls or
logic mocks; no replay of closed checks. Preserve original evidence and verify
owned cleanup. No runtime, install, browser or CI was run to author this contract;
local Storage Guard grants no heavy-operation exception.

Production deployment `dpl_BASnM5VtYvhPWUKnW4hcE5VDhodd` was freshly observed
READY/production at the baseline Git SHA with canonical alias
`trippin-theta.vercel.app` at 10:59 UTC. Refresh before activation. The preparation
commit differs from the served source solely through scoped documentation/check
paths. Every application input remains exact. Each profile has eleven snapshots
and six actual root navigation/reload observations; retain their original byte
values and sole expected deployment ID separately from source/compilation claims.

The Tier 2 driver is `tests/integration/browser/linked-wallet.mjs`; its supervisor
is `tests/scripts/run-linked-wallet-checks.mjs`; the inactive workflow is
`linked-wallet.workflow.yml.example`. Reuse Node 24.21.0 and Playwright 1.61.1
in a frozen isolated tool installation, without application dependencies/builds.
Keep original HOME and owned npm/config/cache/XDG/browser/temp roots. One public
Ubuntu job on `qa/trippin-wallet-20261107-1` is capped at 15 minutes and disabled
and retired after its terminal result. Require a concrete changed repair before
another attempt; preserve failures. Keep the accepted earliest-clock budget:
720 seconds supervisor work, 90 cleanup and 30 startup/output margin; driver
240 work, 100 per case, 60 cleanup and two final-output seconds. Preserve normal
page/context/browser closure and original outputs before acceptance gates.

Optional Browserbase is not installed or required. The documented optional
installer is `python3 scripts/install-external-skills.py --skill browserbase-ui-test --agent codex`;
it has not been run. Source/AST/whitespace review only is permitted locally
while Storage Guard is below reserve. No physical-device, real-provider,
server/database, pricing, purchase, account or full-product proof follows.
