# Product contract

Last updated: 2026-11-18

## Current consumer iteration

The [14 November GEN-3659 request](https://app.notion.com/p/418a1ee8bd0680c99343ea23eb42d0dd) supersedes the sample-first entry and three-column visual direction below. Fresh users see a consumer landing page, register/login actions and an empty profile/trip list. Planning without an account remains an explicit device-local option. Accounts use server-verified Supabase Auth sessions; their browser workspaces and public-plan capabilities have separate namespaces. The isolated application passed its authored-provider acceptance, and the dedicated provider separately passed real signup, email confirmation and session qualification. Production Auth variables and the [production return configuration](results/2026/11-16/consumer-release-status.md#provider-and-auth-configuration) are verified. The consumer edition is published through PR3; real-provider hosted API checks pass, while native browser and controlled first-click acceptance remain pending. See [account setup](accounts.md) for current boundaries.

The selected trip owns itinerary, reservations, budget and daily food/transport allowances. No standalone budget or Discover destination page remains. Event search is inside its trip; existing public-trip management remains under the profile. The sidebar becomes a compact header and trip tabs, with narrow-screen itinerary/map switching retained. Daily directions preserve stop order and exclude skipped/unchosen alternatives. Links split with an overlapping stop after five destinations to fit mobile-browser waypoint limits; see [Google's Maps URL contract](https://developers.google.com/maps/documentation/urls/get-started#directions-action).

Food and transport each use the higher of their total known trip costs or their daily allowance multiplied by the number of trip days. Applicable itinerary estimates, linked reservations and recorded expenses contribute once under the existing replacement rules. The allowance minimum applies across the whole trip; this clarification leaves the calculation and date attribution unchanged. The [accepted wallet ledger](proposals/linked-wallet-checks.md#independent-cost-and-durable-state-expectations) records the same whole-trip floors.

Legacy guest trips remain available explicitly, without attaching them to a signed-in account. Original v1 storage stays intact; only an exactly untouched seeded profile is cleared in the new guest projection. Existing customized profiles and all trips are retained. Empty workspaces now validate and round-trip through backups. A nonempty workspace mounts the trip editor; deleting the last trip or restoring an empty backup returns to the landing page.

Returning users see a compact introduction and saved trip cards with the trip name, destination and readable dates. The new-trip form explains invalid or incomplete date ranges without changing the chosen dates. A final private trip can be deleted after confirmation and a verified empty save, provided no public-plan management entries would become inaccessible. Public itinerary snapshots retain explicit daily allowances, including zero; older trips without overrides still use the recipient's profile defaults. See the [source qualification summary](results/2026/11-16/consumer-release-status.md#source-and-isolated-qualification).

An editor save failure stays visible until a verified save succeeds. Retry and backup actions use the latest in-memory workspace. Leaving for the home/account flow first attempts to save; failure keeps the editor open and offers an explicit choice to leave without saving. Pending file reads are cancelled on departure, and the editor prevents new interaction while its account action is pending. The [isolated reliability packet](results/2026/11-16/consumer-release-status.md#source-and-isolated-qualification) qualifies an actual desktop Chromium unload warning and dismissed departure, persistent save refusal, latest-state download, retry and explicit discard. Other browsers and mobile lifecycle handling remain separate. Invalid activity/expense/reservation drafts remain open with an error, and editing a sample reservation preserves its sample provenance. See the [source qualification summary](results/2026/11-16/consumer-release-status.md#source-and-isolated-qualification).

Custom alternatives create a fresh planned stop at the original time, keeping the original and its sibling alternatives available to restore. Reservations and recorded expenses stay attached to their original stop, and remain counted alongside the new estimate. Custom events require explicit selection and receive their own manual identity. Replaced workspaces invalidate an open custom draft. Day tabs support Left/Right, Home/End and one selected tab stop; the day panel is focusable. On narrow screens the map and directions use normal content flow, with an explicit switch that preserves focus and exposes its state. The [source-specific Chromium summary](results/2026/11-16/consumer-release-status.md#source-and-isolated-qualification) qualifies reversible alternatives/linked costs, 31-day keys and 320/390-pixel map/directions/focus/card behavior at its exact source. Physical devices, assistive technology, live provider data and production remain separate.

Manual activity, event, expense, reservation, alternative and trip-detail edits are admitted atomically against the latest trip identity and complete workspace. A queued CSV addition cannot bypass record or size limits; refusal keeps the draft open without success feedback. Accepted trip-detail edits retain newer expenses, reservations and publication state. A successful backup restore closes editing dialogs only after verified persistence; failed or stale reads preserve drafts. Pending edits also guard departure. See the [focused atomic-edit controls](../tests/unit/manual-trip-edits.test.mjs).

The later [confirmation/recovery qualification summary](results/2026/11-16/consumer-release-status.md#source-and-isolated-qualification)
corrects failed email-return feedback and lets users explicitly recover a corrupt
space from a valid backup. It retains a verified original-data archive before
replacement and keeps archive downloads available afterward. Other spaces,
publishing keys and readable public references are preserved. Automatic recovery
is bounded to 40 source trips and 256 final scoped owner/journal entries; larger
or unknown data retains the lossless manual-recovery path. No automatic overwrite
guard is weakened. The fresh isolated packet passes 93 controls, Next/Eve builds
and both desktop Chromium journeys, including native Web Locks, file selection
and recovery downloads. Its corruption and guest boundaries are authored;
real-provider hosted application acceptance remains pending.

The approved sender/template setup now delivers a direct HTTPS confirmation
link from `hello@clous.app`, with SPF/DKIM/DMARC passing. The fresh own test
account is confirmed; its controlled verification found the token already
consumed. Controlled first-click and hosted application acceptance remain
separate from these provider observations.

## Original product scope and release history

Trippin helps solo travelers and people with a weekend or 4–7 days make the most of a city without fixing every hour in advance. The original release used a labeled Munich sample; it is no longer the default for new workspaces.

## Required experience

1. Create and manage multiple dated trips; save edits between visits.
2. Keep a flexible daily itinerary: add/edit/reorder activities, mark done or skipped, select alternatives.
3. Keep an interactive map on the right on desktop with selected-day places, estimates of walking distance/time, and external directions. Mobile gets an accessible map toggle.
4. Show full projected costs: flights, stays, event admissions, food, transport, and actual expenses without double counting linked reservations.
5. Keep flight, stay, and event reservations together, with external booking links. Native purchasing depends on provider agreements and payment setup.
6. Personalize around interests, explicit event preferences, and ordinary daily spending. Event discovery fits the trip's local dates and can become an editable stop with a confirmed EUR estimate. Bank credentials never enter Trippin; manual expense input and CSV import work without a bank provider.
7. Support a travel profile, derived country/activity and individual-event badges, sharing, public trips, and join requests. Event badges follow self-reported completion and deduplicate provider identity across copied trips. Sample people and events must remain visibly labeled.
8. Offer an EVE assistant using Vercel's framework, with explicit credential availability, errors, and user consent before using private trip context.
9. Publish source to `alvarovillalbaa/trippin` and deploy on Vercel; keep release evidence and remaining provider prerequisites.

## Release boundaries

Local trip data belongs to the browser. Public directory/join requests require Upstash Redis REST credentials; without them the UI must not pretend requests reached another person. Public records exclude booking references and expenses. An owner capability is generated in the browser and hashed server-side. It is not a verified identity system.

External providers have independent contracts. Airbnb/Booking.com inventory, native flight purchases, Meetup sync, owned Luma calendars, bank linking, and Strava API import are not implied by a working UI. Record verified provider constraints in `docs/integrations.md`. All estimates, sample events, and sample people are visibly identified. Weather has an independent network failure state.

## Original visual direction (historical)

An elegant travel journal: warm off-white, forest-green navigation and controls, orange accents, editorial destination photography, clear spatial hierarchy, quiet motion, and practical activity cards. Desktop is a three-column workspace; small screens collapse navigation and present an explicit itinerary/map choice. Respect keyboard navigation and reduced motion.
