# Trippin

Trippin is a Next.js travel workspace with an EVE travel assistant. Use Node 24.
Read `README.md`, `docs/product.md` and `docs/accounts.md` before changing behavior.
The dated [consumer release status](docs/results/2026/11-16/consumer-release-status.md)
is the current navigation for source, provider/configuration and release proof.
Historical receipts and earlier failed candidates remain unchanged.

## Current source and release boundaries

- The consumer edition was activated through PR3 at
  `1b6a4c3d4e1ec6089281139a8b1d89ba3704cb62`; its actual homepage/deployment-ID
  and hosted Auth API checks passed. The [Next security repair](docs/results/2026/11-18/next-security-release.md)
  binds the later qualified dependency pair, complete audit and release gates.
  [Native hosted sessions](docs/results/2026/11-18/hosted-auth-sessions.md) pass
  desktop/narrow login, reload, provider renewal after access-cookie removal
  and visible logout. [Fresh hosted signup/confirmation](docs/results/2026/11-19/hosted-auth-confirmation.md)
  passes H-C21/H-C22 at runtime `c5edeabdf8a0ee1199f6dd4149f2b4ea809b3909`
  with complete redirect interception and both own sessions locally revoked.
  Real elapsed TTL expiry remains unqualified. Latest measured Storage Guard
  fails at15.3 GiB against34.0 GiB.
  The approved confirmation/recovery
  packet passes 93 controls, Next/Eve builds and both fresh Chromium journeys at
  source `762911fc0f9ba3375dd68bb535de2b71dfcd31ac`, run `44055810000`.
  Its workflow/ref are retired after142/1200CIseconds. All older packets and
  unused budgets remain closed; never replay their identities.
- The owner's standing approval covers necessary execution follow-ups for this
  Trippin task. Give changed qualification candidates fresh identities and
  bounded ledgers; preserve earlier failures and close each invocation's unused
  budget. This does not reopen closed cases or extend work to unrelated services.
- Approved SMTP/IAM setup and the separately approved one-field confirmation
  template correction are applied. A fresh own-mailbox email has a direct HTTPS
  provider link and passing SPF/DKIM/DMARC. Its controlled verification returned
  `otp_expired`; password login and `/user` confirm the same new account was
  already confirmed. The prior consumption cause remains unproven; the later
  fresh hosted packet separately passes controlled first click. Approved release
  publication/deployment is done; future
  changes retain their scope-specific owner gates.
- Assemble a release as an overlay on fresh full main. Never merge the sparse QA
  tree wholesale or ship its synthetic Vercel deployment refusal. Preserve dirty
  shared work, unselected main files and history.
- Use only the dedicated Trippin Auth project `erxeujubtgkxppmuncdy`. Provider
  signup/confirmation/session qualification, verified production variables and
  verified return configuration do not prove hosted application acceptance.
  Preserve confirmation requirements and unrelated settings.
- The configured sender is `hello@clous.app`; actual own-mailbox delivery passes
  SPF/DKIM/DMARC. The old tracked-link HTTP failure remains preserved. The new
  provider-only direct-link receipt, confirmed identity and local logout pass;
  the later fresh hosted packet separately qualifies controlled first click
  and native application behavior at its named source/deployment.
  Never change unrelated projects, share their Auth, pause them or upgrade a
  paid plan to bypass capacity. Missing real checks remain explicitly pending.
- Preserve private task credentials: ignored `.env.trippin-platform.local`
  directory700/token600, with per-command `SUPABASE_HOME` and
  `SUPABASE_NO_KEYRING=1`; ignored `.env.trippin-auth-setup.local` and identity
  files remain600. Retain the dedicated SMTP credential for the configured
  service. The45 original,33 template-check and29 hosted-API ephemeral files and
  current test sessions were removed. The two hosted-test credential fields were
  removed with exact pre-hosted setup restoration. Never publish login links,
  codes, tokens or test credentials.
  The completed login supersedes the old interactive handoff; inspect its private
  state before reuse and do not replay codes or restart login automatically.

## Application invariants

- `components/travel-app.tsx` owns entry/account lifecycle, empty spaces and
  recovery; `components/workspace.tsx` owns the nonempty trip editor. Preserve
  the trip model in `lib/types.ts` and account/guest namespaces.
- Fresh users receive no fictional profile or sample trips. Keep labeled
  historical samples in explicit fixtures. Guest v1 storage and public-plan
  recovery entries remain preserved; authentication does not establish a
  server-side community account ACL or cloud trip synchronization.
- Daily food/transport overrides belong to Trip. Absent overrides retain the
  older backup's profile defaults. Ordered Maps links exclude skipped/unchosen
  alternatives and preserve the existing waypoint splitting.
- Backup and editing callbacks must respect the latest file, navigation,
  workspace and account intent. Normal corrupt-data overwrite refusal remains
  intact. Explicit recovery verifies an original archive before replacement,
  preserves other spaces/public references and refuses stale operations.
  Automatic recovery is bounded to 40 source trips and 256 final scoped entries.
- Never present seeded trips, events, prices, flight statuses or people as live
  provider data. Keep provider credentials server-side. Never store bank
  credentials or payment details. AI suggestions require explicit application.
- Use targeted static checks within the authorized scope and `git diff --check`
  after edits. An explicitly authorized release qualification uses
  `npm run check` and `npm run build`; full local runtime remains subject to
  Storage Guard and the workspace's separate execution gates.
- Keep integration setup and precise proof boundaries in `docs/`. Current public
  navigation should use the curated release summary, not private operator
  handoffs or unreviewed raw result trees.

## Approved portability acceptance — 2026-11-05

The user's standing "I approve everything / Keep going / Do all the work"
instructions cover the [v2 CSV/backup scope](docs/proposals/csv-backup-browser-v2.md):
ten real desktop/narrow-touch Chromium cases on the public app: the original
eight portability cases and two user-zoom/navigation lifecycle regressions, using only
authored private browser data, in one temporary public Ubuntu job per changed
candidate, capped at 15 minutes. Pin both the reviewed source and the actual
READY deployment served by the alias. The temporary push workflow belongs only
to `qa/trippin-portability-20261105` and is retired after a terminal run.
Install only the pinned browser tool/Chromium in owned runner storage; do not
install application dependencies or alter the app manifest. Block APIs,
providers, mutations and unexpected network traffic; no account, model call,
server write, bank connection or public trip is part of this acceptance.
Preserve failures and verify owned cleanup. Local Storage Guard still applies;
this scope does not authorize a local install, build or browser run below its
reserve.

## Approved itinerary lifecycle acceptance — 2026-11-07

The owner's renewed "Keep going / Do all the work" and standing approval cover
this [focused itinerary packet](docs/proposals/itinerary-lifecycle-checks.md):
one desktop and one narrow touch-emulated Chromium journey using the labeled
Munich sample in fresh disposable private browser contexts. It covers done,
skip/restore, the authored garden/museum alternative, estimates and reload.
The earlier creation/share and ten CSV/backup/zoom cases remain closed.

Use only the reviewed source and an actually READY canonical deployment, with
unchanged application input bytes explicitly bound to its Git source. This is
Tier 2 browser-client integration; hosted backend, providers, models, physical
devices and full-product acceptance remain separate. Block/count the existing
API/weather/tile/font boundaries; unexpected reads, mutations, WebSockets and
page errors fail. Do not seed app state or invoke internal handlers.

One temporary public Ubuntu job per changed candidate is capped at 15 minutes.
Install only the pinned browser tool/Chromium in owned runner storage, preserve
HOME and original failure outputs, and verify source/browser/process teardown.
Do not install application dependencies, run a broad app build, change paid
services or retry an unchanged failure. The workflow belongs only to
`qa/trippin-itinerary-20261107-1` and is disabled/retired after its terminal run.
Storage Guard still prohibits local installs, builds and browser runs below its
reserve. No local storage exception is granted here.

The [first result](docs/results/2026/11-07/itinerary-lifecycle-attempt-1.md)
accepts L01/L02 at preparation `562876d25a59e91fba22a5a009729e0dcb26cc1b`.
The workflow is disabled. These identities are closed; retain their source,
runtime/deployment and client-only proof boundaries before choosing new work.

## Approved linked wallet acceptance — 2026-11-07

The owner's standing "I approve everything / Keep going / Do all the work"
covers the [focused wallet packet](docs/proposals/linked-wallet-checks.md):
W01 desktop and W02 narrow touch-emulated Chromium, once each in fresh private
Munich sample contexts. Save/edit one authored event reservation linked to an
existing admission, record an actual expense, remove the reservation while
retaining its expense against that admission, then delete the expense. Check
visible EUR reconciliation, stable IDs and eleven whole-workspace observations
per profile, including real reloads and exact baseline restoration.

Earlier core, CSV/backup/zoom and itinerary L01/L02 cases remain closed. Use
actual UI only; do not seed storage, invoke application helpers, buy anything,
create real bookings/accounts or call providers/models/banks/public-trip APIs.
Retain the accepted Tier 2 source/deployment, strict blocked-network, original
output and normal browser/process cleanup boundaries. One temporary public
Ubuntu job, at most 15 minutes and no unchanged retry, belongs only to
`qa/trippin-wallet-20261107-1`; disable/retire it after a terminal attempt.
Install only pinned Playwright/Chromium in owned runner paths, preserve HOME,
and do not install/build/serve the app. Storage Guard still prohibits local
heavy operations below reserve; no exception is granted here.

## Approved changed wallet candidate — attempt 2

The first [wallet attempt failed](docs/results/2026/11-07/linked-wallet-attempt-1.md);
its source and originals are immutable and neither case is accepted. Versioned
Playwright 1.61.1 source proves exact nested-label strings include select-option
text. This changed candidate uses anchored label regexes for those five controls,
inside explicitly unique visible named dialogs, with bounded read-only selector
metadata. Inputs, real controls, fixture, budgets, IDs, whole-workspace/ledger/UI
gates and network/cleanup boundaries remain unchanged. The original composite
timeout alone does not prove dialog presence or isolate its missing sublocator.

Standing autonomous/check approval covers this concrete changed candidate once
on `qa/trippin-wallet-20261107-2`, at most 15 free public runner minutes.
Preserve the three first-attempt originals byte-exact in source. Disable/retire
the second workflow after its terminal run; do not repeat an unchanged failure.
No app change, provider/model call, paid service or local storage exception.

The [changed second result](docs/results/2026/11-07/linked-wallet-attempt-2.md) accepts W01/W02 at source
`9a755d6e6d004e4210bf3ac7f000313a211701ec`, run 42368205577. Its
actual native labels/dialogs, 22 whole-workspace originals, reconciliation and
normal owned teardown passed audit. The second workflow is disabled. Attempt 1
remains failed and unchanged; these case identities are now closed.

## Approved stay-comparison repair and acceptance — 2026-11-08

The owner's standing "I approve everything / Keep going / Do all the work"
covers the [stay comparison scope](docs/proposals/stay-comparison-checks.md):
zero overnight nights for same-day trips, stated finite input bounds, complete
option totals rounded to cents and an explicit equal-total conclusion. The
three application changes are published at
`64faf1ca70ee2989b06a1444595b2d00304b5825`. Vercel runs the existing
`npm run check` and `npm run build` commands; browser acceptance is separate.

S01 desktop and S02 narrow touch-emulated Chromium use real private UI only.
Each profile checks the scratch calculator, twelve whole-workspace stages and
four actual root navigations, creates/deletes one authored one-day Munich trip
and restores exact baseline data. Calculator-only edits must preserve saved
workspace bytes. Include the independent EUR 1.005 → 1.01 rounding case.
Keep all prior creation/share, CSV/backup/zoom, L01/L02 and W01/W02 cases closed.

One manual public Ubuntu job per changed candidate, capped at fifteen minutes,
checks immutable source/runtime/deployment inputs from main. The prepared
source is the runtime commit's direct child: only append-only AGENTS/tests
documentation and four new driver/supervisor/proposal/inactive-workflow paths.
The later active workflow is outside that checked source. Preserve full source
guards, pinned Node 24.21.0 / Playwright 1.61.1, original HOME, bounded originals,
network refusal and normal owned browser/process/scratch cleanup. Unknown
ownership fails. Preserve failed results and require a changed candidate before
retrying; disable/remove the one-off workflow after its terminal attempt.

Install only the pinned browser tool/Chromium on the owned runner. No app
dependencies/build/server in that job, provider/model/bank call, real booking,
account, paid service or server write. Only disposable authored browser-local
trip changes are allowed. Storage Guard prohibits local heavy runtime below
reserve; no local exception is granted. The zero-night assistant-tool schema
has source/build coverage only, without a live tool/model turn.

### Changed second stay candidate

The [first stay attempt failed](docs/results/2026/11-08/stay-comparison-attempt-1.md);
keep its exact receipt, log and human record. The source-derived responsive
badge mismatch motivates a precise optional-count My trips matcher and one
bounded actual unique-visible button/badge observation. It does not supply
missing first-run DOM evidence. All trip/rounding/network/closure requirements
remain; both S01/S02 must pass in the new invocation without carried acceptance.

Standing autonomous/check approval covers this changed candidate once. Its
checked source is a sibling of the first preparation, directly based on runtime
`64faf1ca70ee2989b06a1444595b2d00304b5825`, with the same four checker paths,
two append-only docs and three hash-pinned first-failure originals. Retain it on
the owned `qa/trippin-stay-20261108` bookmark; the main merge/active workflow is
separate. Preserve the first commit/history and disable/retire the temporary
workflow after its terminal attempt. Application bytes, budgets, tools and
local Storage Guard limits remain unchanged; no local runtime exception.

The [changed second stay result](docs/results/2026/11-08/stay-comparison-attempt-2.md)
accepts S01/S02 afresh at checked source
`7e3ac5de60c0e245db2f3ac8993f766a2f87b583`, run `42447910545`.
Both profiles completed twelve exact workspace stages, 42 actual input edits,
four deployment-ID root observations and two dialogs, with authored-trip
deletion/final baseline restoration. Actual desktop/narrow button and badge
observations support the changed matcher. Five 123-file guards, all forty
normal commands and owned browser/process/scratch cleanup passed. Preserve the
first failed source/records unchanged. The one-off workflow is disabled and
its active file is removed in the acceptance publication; the checked QA source
remains an immutable reproduction bookmark. These identities are closed.
Provider/build/alias history is separate in the
[deployment projection](docs/results/2026/11-08/stay-comparison-deployment.json).

## Closed workspace reliability acceptance — 2026-11-16

The owner's explicit “I approve.” authorized the isolated reliability packet.
Its [source-specific summary](docs/results/2026/11-16/consumer-release-status.md#source-and-isolated-qualification) records passing
R-N01–R-N04 together, 101 focused controls, Next types/TypeScript and Next/Eve
builds at source `108fddc18c59b4f683139009e0c9a1f607f69137`, run `43939902941`.
Independent artifact/source/normal teardown checks pass. Three earlier attempts
remain failed; do not carry their partial observations as acceptance. Actual
cumulative CI is 267/1,200 seconds (4m 27s); identities and unused budget are closed.
The temporary exact-ref push workflow is disabled/removed and the owned QA ref
deleted, with independent readback, unchanged main `2afbdb70ade0704cf6efd53f884d2a6e6930c1ac`
and zero QA Vercel deployments. Preserve dirty source and all original failures.
This loopback Tier 2 packet uses authored guest Auth and a synthetic write-refusal
boundary; it does not activate production, real-provider Auth, models or purchases.
