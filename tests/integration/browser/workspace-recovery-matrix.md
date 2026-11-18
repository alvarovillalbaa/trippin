# Confirmation and corrupt-workspace recovery acceptance

Prepared 16 November 2026. **Inactive source only; not executed or accepted.**
These two new identities require a new, explicit owner-approved invocation and
an exact reviewed source/build. Preparing files or setting an environment flag
does not grant execution permission. Earlier consumer, reliability and other
native identities remain closed; no result or unused budget carries here.

| Identity | Profile | Required fresh observations |
| --- | --- | --- |
| RC-N01 | Desktop 1440 × 1000 | Open an authored failed-confirmation return with an ordinary query string, error fields and synthetic description/token sentinels. Require fragment removal, exact query retention and the sanitized failure alert, without raw provider text or account admission. Manually open the existing Log in dialog; require the same alert, empty credential controls and Email focus. Submit no credentials. |
| RC-N02 | Desktop 1440 × 1000 | Create one named Munich trip and one EUR 7 museum stop through UI, then download its actual valid profile backup. Apply the declared private storage fault below and reload. Download the exact original recovery envelope. Select the valid downloaded backup through the real file chooser: the recovery dialog stages without storage writes. Download its selected original, cancel without writes, select again, and explicitly choose Archive original and restore backup. Require a verified original archive before every target write, exact restored trip/stop data and unchanged canaries. Reload; require the original archive collection button, exact current-space export and an identical restored UI backup. |

Each identity uses a separate new disposable context, with zero retries, a
150-second case deadline and a five-minute packet work deadline. Context closes
have a 15-second bound, browser close 20 seconds, and route drains five seconds.
Both cases and normal closure must pass in the same invocation. Partial results,
an unavailable runtime or unconfirmed cleanup do not pass. Failures are retained;
a later invocation requires a changed reviewed candidate. The supervisor owns
server/process/scratch cleanup and the separate execution budget.

## Declared T2 fixture exceptions

The driver never imports application helpers or calls internal UI handlers.
Actual controls create the valid trip and backup. RC-N02 then deliberately
replaces only `trippin.workspace.v2.guest` with that same compact UI backup minus
its final `}`, followed by one lone UTF-16 `D800` code unit. This is authored
invalid JSON, not spontaneous corruption, native quota or storage-capacity proof.
The original JSON download envelope must preserve that exact code unit.

The same one-time fixture adds exactly three opaque scope canaries:

- `trippin.workspace.v1`: an invalid, labeled legacy sentinel.
- `trippin.workspace.v2.user.22222222-2222-4222-8222-222222222222`: an invalid,
  labeled other-space sentinel; no user is admitted for this UUID.
- That other-space key plus `.recovery.rc-n02-canary`: an opaque synthetic
  archive envelope that must not enter the guest archive export.

These entries belong only to this authored disposable context. They are declared
test data, not existing user data, validated account workspaces or real account
isolation evidence. Recovery must retain all three byte-exact and preserve every
other origin storage entry. The fixture seeds no valid trip, identity, session,
publishing capability or backend state. Public-plan capability salvage and
legacy-only corrupt-source recovery are covered by authored source controls,
not claimed as native acceptance by these two cases.

RC-N02 also installs the named test-only
`__TRIPPIN_RECOVERY_TEST_ONLY_STORAGE_AUDIT__` observer. Its transparent
`Storage.prototype.setItem` wrapper invokes the original method and retains its
return/throw behavior. It records only this guest workspace and its archive
prefix, including archive contents observed before a target write and the native
readback afterward. It never refuses, changes, retries or generates a write.
The audit is bounded to twelve events and 160,000 characters; overflow or any
inspection error fails. The observer resets on navigation, so the corruption
and restore phases have distinct evidence. Complete read-only storage snapshots
also gate staging, cancellation, restore, reload and exports.
The recovery helper uses the actual Chromium `navigator.locks` implementation;
the driver requires its availability and never mocks or wraps Web Locks.

## Network, tooling and artifact boundary

`/api/auth` accepts only a browser-intercepted `session` request and replies
`{available:false,user:null}`. No request reaches Auth and no cookie is issued.
The failed fragment is synthetic; this packet does not deliver an email, handle
a real provider confirmation, accept a token, register, log in or change any
Auth configuration. Real account admission and hosted-provider behavior remain
unverified.

Known API reads, weather, map tiles and fonts are blocked and counted. Unexpected
reads, all other mutations, admitted request failures, WebSockets, extra pages,
cookies and uncaught page errors fail. Provider/model/bank calls, real bookings,
sharing, email and server writes are excluded. The source-only driver installs,
builds and serves nothing and has no network target beyond the owned loopback
application's allowed static resources. Maps/provider links are never opened.

The inactive entry requires `TRIPPIN_RECOVERY_APPROVED=1` only after separate
owner approval, `GITHUB_SHA` with the reviewed 40-character commit,
`TRIPPIN_RECOVERY_ORIGIN` with an HTTP(S) root loopback origin (`localhost`,
`127.0.0.1` or `[::1]`), `TRIPPIN_RECOVERY_OUTPUT` with an absolute owned
invocation directory without prior driver outputs, and `TRIPPIN_PLAYWRIGHT_PACKAGE` with the already provisioned
pinned tool package. Node 24.21.0 and Playwright 1.61.1 are required. Production
or arbitrary remote origins, non-root paths and prior driver results/downloads/
screenshots fail. Existing supervisor metadata in the same invocation directory
is expected and retained.
The supervisor's proposed owned origin is `http://127.0.0.1:4319`.

`native-result.json` records source hashes, both case IDs, boundary counters,
observations, storage write order and normal context/browser closure. JSON is
bounded to 500,000 bytes, each actual download to 120,000 bytes, each viewport
screenshot to 2 MB, and failure DOM text to 12,000 characters. Downloaded originals
remain separate artifacts. A later passing run would establish these desktop
Chromium/UI observations only. It would not prove release builds, production
activation, native storage failure, real Auth/providers, other browsers, physical
devices or assistive technology. No browser or application runtime is executed
as part of this preparation.
