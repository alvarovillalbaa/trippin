# Consumer release status

Updated 18 November 2026; initial summary 16 November. This page curates the retained source, CI and provider
receipts for release documentation. It does not execute or replace those checks.
Historical failures and originals remain preserved. Private credentials,
operator handoffs and unrelated portfolio operations are excluded from this page.

## Current status

The consumer edition was activated through [PR3](https://github.com/alvarovillalbaa/trippin/pull/3),
merge source `1b6a4c3d4e1ec6089281139a8b1d89ba3704cb62`. Its production
`dpl_2AYA6SccmYSgJYvkK7VbhUkQtCFe` was READY on the canonical alias. Actual root
HTML returned200 and embedded that deployment ID; a referenced entry asset returned200.
Its Preview and production passed Next compilation, TypeScript and Eve builds.
The exact196-blob tree preserves every unselected main path and history; the
merged release branch is deleted. The dirty local index/refs remain untouched.
The pre-activation snapshot below remains historical.

A fresh real-provider hosted API journey passes anonymous lookup, signup with
confirmation required/no session cookie, actual signed direct HTTPS email,
ordinary login, a separate cookie-jar session lookup for the same confirmed own
identity, logout/cookie clearing and a final anonymous session. Both cookies
are host-only, Secure, HttpOnly and SameSite=Lax; replies are private/no-store
with no tokens in JSON. The single new email allowance is closed. Controlled
confirmation returned `otp_expired`; the token was already consumed, with cause
unproven. That API packet does not accept first click, native cookies, rendered
return, reload or renewal. All29 private API/mail/cookie files were removed after
hash binding and absence checks; credentials and original identity are preserved.

The later [native hosted-session packet](../11-18/hosted-auth-sessions.md)
passes desktop and narrow touch-emulated login, native-cookie reload, real
provider renewal after access-cookie removal and visible logout. It binds
production `9657b96830c2bdbc136640a471c2cc9ca20a2977` and deployment
`dpl_FX3xgx3fDhvv3Hx6WK1nqzo4MWf5`; four safe anonymous screenshots were
visually reviewed. Native signup, controlled confirmation first click and real
elapsed TTL expiry remain unqualified. Local Storage Guard newly fails at13.1
GiB against34.0 required; the isolated remote runner supplied this proof.
A20-minute deployment-scoped error/fatal
scan returned no matching groups, without a full-observability claim.
The activation baseline audit reported one moderate affected Next16.4.2 package covering
[unstable_cache nesting](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h)
and [nested use-cache metadata](https://github.com/vercel/next.js/security/advisories/GHSA-vc7v-qv4w-wrv8).
Source/config has no documented use-cache/root-param prerequisites; this is a
source inference, not an exploit test. The later [Next16.4.6 repair](../11-18/next-security-release.md)
qualifies the exact generated pair with an explicit complete-graph clean audit,
42 focused controls, types, both builds and normal process/source/output cleanup.
Its release PR records Preview/production and served-source readbacks separately.
The first failed cleanup and second incomplete audit remain preserved and
unaccepted. All three temporary workflows/refs and invocation budgets are closed.

## Before activation — retained snapshot

The consumer iteration is implemented locally: an empty first workspace,
signup/login entry, separate account/guest browser spaces, trip-owned budgets,
ordered Maps links, save/departure safeguards and explicit corrupt-space recovery.
Its latest confirmation/recovery source passed isolated builds and two native
journeys. Production and real-provider hosted application qualification remain
pending.

Fresh GitHub metadata still identifies production main as
[`2afbdb70ade0704cf6efd53f884d2a6e6930c1ac`](https://github.com/alvarovillalbaa/trippin/commit/2afbdb70ade0704cf6efd53f884d2a6e6930c1ac).
Vercel metadata reports production deployment `dpl_mbeJtQZNjoHCSvhnfuDn2sao32aD`
as READY at that SHA, with `trippin-theta.vercel.app` among its aliases. These
readbacks establish the reported source/deployment relationship; the served
HTML/assets and actual hosted consumer behavior were not requalified here.
The consumer edition therefore remains a release candidate, while the recorded
production deployment serves the previous edition.

Authentication does not synchronize trips or turn the public community
capability API into a server-side account ACL. Read [account boundaries](../../../accounts.md)
and the [product contract](../../../product.md) before changing either behavior.

## Provider and Auth configuration

The dedicated Trippin Supabase project is `erxeujubtgkxppmuncdy`. Earlier on
16 November, real public-provider operations qualified one authorized own test
account: accepted signup without session admission, actual mailbox receipt and
confirmation, password login, refresh, three matching provider-verified identity
observations and two provider-local 204 logouts. That confirmation returned a
303 toward localhost; the redirect was deliberately not followed. A fragment
alone was not treated as a verified identity.

Later management GET/PATCH/GET responses each returned 200. Only `site_url` and
`uri_allow_list` changed to `https://trippin-theta.vercel.app` and its exact root
return `https://trippin-theta.vercel.app/`. Every other returned setting matched:
confirmation remains required, anonymous admission disabled, and email/signup
enabled. The later 18 November SMTP check separately confirms the direct
provider return uses that canonical HTTPS root.

The two server variables `TRIPPIN_SUPABASE_URL` and
`TRIPPIN_SUPABASE_PUBLISHABLE_KEY` were separately created as production-only
sensitive Vercel values (201/201), followed by a successful independent metadata
readback (200). Configuration acceptance does not prove the future deployment
uses those values correctly. Values, passwords, tokens, test-address details
and login links are excluded from release documentation.

The configured sender is `hello@clous.app`, through SES `eu-west-3`. On
18 November, the approved dedicated IAM/SMTP operation changed only the six
SMTP fields; independent complete GETs confirm every other persisted Auth
setting stayed equal, including the2/hour limit and confirmation/admission rules.
A first request failed on the domain's existing configuration-set permission;
the exact resource was added to the same sender-constrained policy and read back.
No shared SES setting, DNS, paid feature or unrelated project changed.

The second request delivered an actual own-mailbox email from Trippin, with SPF,
DKIM and DMARC passing. Direct HTTPS provider confirmation returned303 toward
the canonical production root (not followed); provider identity200 matched the
new confirmed own alias, and local logout204 closed the session. Forty-five
owned temporary files were removed; original credentials/identity are preserved.

The original received anchor was SES-tracked through `clous.app/CL0/…`; its first
response was301 to HTTP on `www.clous.app`. That chain was stopped and the failed
result remains preserved.

The owner separately approved the one-field confirmation-template correction
and one fresh own-mailbox check within USD0.01 incremental traffic. Only
`ses:no-track` was inserted in the existing confirmation anchor, preserving
every other template byte. Before/PATCH/independent-after/final requests
returned200. The corresponding derived custom-template flag changed from false
to true; every other custom flag and independent Auth setting stayed equal,
including the existing2/hour email limit and confirmation/admission rules.

The single new signup returned200 without a session. Its actual email arrived
from Trippin with SPF/DKIM/DMARC passing and a direct HTTPS link to the dedicated
provider's signup-verification endpoint, with no tracking wrapper. Our controlled
request returned303 to the canonical HTTPS root with `access_denied` /
`otp_expired`, deliberately not followed. Password login and `/user` then
returned200 for the same fresh confirmed nonanonymous identity; current-session
local logout returned204. This verifies direct-link delivery and an already
confirmed account. The cause of prior token consumption and a controlled
first-click success remain unproven; no extra email was sent.

All33 template-check ephemeral files and the current private session were
removed. Original credentials/identity and the complete pre-template setup
prefix remain byte-exact. No shared SES/DNS setting, other template, rate or
admission policy, application source or production activation changed.

These are provider/configuration observations, distinct from app-issued cookies
or hosted signup, confirmation, login, renewal and logout. Native real-provider hosted
application acceptance remains pending.

## Source and isolated qualification

The completed isolated packets used built Next/Eve applications and disposable
Chromium contexts. They are tied to their recorded sources, not to later edits.

| Packet | Immutable source and run | Recorded result and boundary |
| --- | --- | --- |
| Consumer/Auth V2, 15 November | [Source `4b889ca4`](https://github.com/alvarovillalbaa/trippin/commit/4b889ca4c52a5a3834f77e27518d99ff59697e95), [run 43753920462](https://github.com/alvarovillalbaa/trippin/actions/runs/43753920462) | 61 focused controls, type generation/checking, Next/Eve builds and six fresh browser journeys passed. Auth used authored fixtures, not Supabase/JWT/email. |
| Workspace reliability, 16 November | [Source `108fddc1`](https://github.com/alvarovillalbaa/trippin/commit/108fddc18c59b4f683139009e0c9a1f607f69137), [run 43939902941](https://github.com/alvarovillalbaa/trippin/actions/runs/43939902941) | 101 focused controls, type generation/checking, Next/Eve builds and four fresh browser journeys passed: reversible alternatives/linked costs, 31-day keyboard navigation, narrow maps/cards and save/departure recovery. Guest transport and storage-write refusal were authored. |
| Later confirmation/corrupt-space recovery source | [Data controls](../../../../tests/unit/corrupt-workspace-recovery.test.mjs), [recovery UI](../../../../tests/unit/workspace-recovery-ui.test.mjs), [backup UI](../../../../tests/unit/travel-backup-ui.test.mjs), [confirmation return](../../../../tests/unit/account-confirmation-return.test.mjs) | 54 data plus 39 selected frontend controls passed on Node 24.21.0. These are authored Storage/React/file/lock checks; they do not mount React, exercise native Web Locks/file pickers or establish a new release build. |
| Confirmation/recovery, 17 November | [Source `762911fc`](https://github.com/alvarovillalbaa/trippin/commit/762911fc0f9ba3375dd68bb535de2b71dfcd31ac), [run 44055810000](https://github.com/alvarovillalbaa/trippin/actions/runs/44055810000) | 93 controls, type generation/checking, Next/Eve builds and both fresh RC-N01/RC-N02 journeys passed, including native Web Locks, file chooser, archive ordering, five downloads and exact restore/reload. Guest Auth and corruption/canaries are authored. |

Counts describe separate, potentially overlapping scopes and must not be added
across packets. Earlier failed candidates remain failed. The old packets and
their temporary workflows/refs are retired; final cumulative CI was 248/1,200
seconds for V2, 267/1,200 for workspace reliability and142/1,200 for recovery.
The first recovery candidate remains failed on an admitted image request; the
changed second candidate waits for actual image completion and retains every
strict network failure gate. Both recovery identities and the unused1,058seconds
are closed; no earlier partial acceptance or unused budget carries forward.
The recovery run's separate workflow head is
`5d0832f5a3ff5f54a4dd54a013f0043d3d621064`, checking out the source linked above.

The reliability run's GitHub head is its separate workflow commit
`f0aecb8aa5a873860f45c8acdca054d59ea5ed9f`; its reviewed checkout/source is
`108fddc18c59b4f683139009e0c9a1f607f69137`. The linked source is not claimed as
that run's head. Fresh metadata reads confirm both source objects remain
accessible and both linked runs are completed successfully; they do not rerun
or extend the recorded acceptance.

The later recovery implementation retains normal corrupt-data overwrite refusal.
A valid backup stages an explicit dialog; confirmation takes a bounded exclusive
lock, verifies scope/intent and original bytes, archives and verifies the original
before replacement, then verifies the candidate and preserved references.
Automatic recovery is limited to 40 source trips and 256 final scoped entries.
Lossless original-data downloads remain available when automatic repair refuses.

## Pending release gates

1. Qualify native signup and controlled confirmation-return rendering in a
   fresh bounded remote scope under the owner's standing execution approval.
   H-A01/H-A02 accept existing-account sessions only; real elapsed TTL expiry,
   cross-tab refresh, physical devices and assistive technology remain separate.
2. Preserve the consumed-token observations and unknown cause. Controlled
   first-click proof remains missing; current email allowances and prior QA
   identities/budgets are closed. A necessary fresh follow-up needs new
   identities, one explicit message ceiling and unchanged provider rate limits;
   never replay a closed link or resend an unchanged failure.
3. Preserve the exact qualified dependency pair and source/build receipts.
   Bind deployment/served-source checks to its actual release head; isolated
   audit/build acceptance alone does not establish hosted browser behavior.

## Before activation — retained gates

1. Keep the completed SMTP/template operations and message allowances closed.
   Direct HTTPS receipt and confirmed provider identity pass. A controlled
   first click remains unverified because the token was already consumed;
   a later hosted acceptance scope must explicitly authorize any new email.
   Preserve every other template, rate/admission setting and shared SES/DNS
   configuration.
2. Keep the completed recovery packet retired. Its source, full142-second ledger,
   failure originals and normal browser/server/process/scratch cleanup are
   independently verified; no further run is pending or authorized.
3. Assemble the production change as an explicit overlay on fresh full main,
   preserving every unselected file and history. The sparse QA tree is not a
   production merge payload; its synthetic deployment refusal must not ship.
   Include only reviewed source/tests and public documentation, with credential
   and link checks. Temporary workflows and private operator materials are excluded.
4. Publish/deploy only within explicit release authority, bind the actual served
   deployment to its intended source, and qualify the real-provider hosted
   application journey. Isolated Auth fixtures, READY metadata and provider-only
   responses do not prove that journey.

Live models/travel prices, native purchases, bank connections, server-side
community account ACLs, physical devices and assistive technology keep their
separate prerequisites and proof limits. An unavailable integration must retain
its visible setup/error state. Nothing in this summary authorizes changing it.
