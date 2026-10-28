# Public-plan management preservation

28 October 2026. Source repair published, production build READY and delivered
client inspected. Browser and configured community acceptance remain separate
requirements.

## Failure and resulting behavior

Clean baseline `a02927bb8377e18c24ffbc4c93447838e8223d06` marked a private trip
public only after its POST response. Closing Share and deleting the private trip,
or finishing a previously started backup restore, could remove its management
entry before publication completed. A lost network/JSON/server response could
also leave a real publication marked private. The server can commit its Redis
write before returning an acknowledgement, so an error or aborted request does
not prove the trip stayed private.

The [workspace](../../../../components/workspace.tsx) now saves a minimal
independent management entry before POST. Your profile lists these plans and
opens their review/unpublish controls even without a private copy. Deletion and
backup commit preserve references before replacing private data. Confirmed
publication flags update only the matching trip incarnation through the
[workspace reducer](../../../../lib/workspace-state.ts); late results cannot
recreate a removed trip or mark a restored same-ID trip public. Trip Settings
preserves the latest public flag when saving private edits.

The [codec](../../../../lib/community-management.ts) retains only ID, title,
city and published/uncertain status, with strict version/shape validation and
bounded records. The [storage adapter](../../../../lib/community-management-storage.ts)
stores each publication attempt under a fresh independent key. A response changes
only its own attempt; any other unknown attempt keeps aggregate status uncertain.
Unpublish captures confirmed keys before DELETE and removes only matching captured
bytes after acknowledgement. Unknown, uncaptured and changed entries survive.
No whole-journal read/modify/write can overwrite another tab's attempt.

New distinct publications are limited to forty managed trip IDs. Concurrent
reservations or imported public flags can temporarily exceed that count; reading,
management and cleanup still work, while further new distinct reservations are
refused. Unknown outcomes can retain conservative entries after unpublish. Native
storage events refresh other tabs; the profile also offers explicit reload.

First-use capability creation re-reads and writes the existing `trippin.owner`
key under one exclusive Web Lock. Existing keys work without that initialization.
Fresh initialization refuses before POST when the required lock API is absent.
The lock is released before network work, and ownership is rechecked after
awaiting it. The capability format, header, hashing and backend authorization
remain unchanged; capabilities never enter management entries or portable backups.

Each community operation owns its busy state, modal epoch, abort controller and
twenty-second fetch/body deadline. Closing, switching context and unmounting fence
late UI effects. A timeout retains the recovery entry. Unmount also invalidates
an unfinished backup read before it can overwrite durable workspace data.

## Verification and boundaries

Checks use authored frontend data, actual source callbacks and the real codecs,
storage adapter and reducer. Controlled storage, fetch/JSON promises, timers and
lock scheduling never call the HTTP route, Redis, a provider or a model. These
are T2 callback simulations, not React/DOM/browser acceptance.

The existing backup/CSV test bodies and assertions are preserved; their adapters
execute the new actual preservation helper against an empty management namespace.
New codec, storage, reducer and callback checks cover malformed data, projection,
storage refusal, capacity, overlapping tabs/attempts, deletion/restoration,
incarnation fencing, unknown acknowledgements and lifecycle ownership.

Node 24.21.0 passed **197 tests**, with zero failures, skips, cancellations or
TODOs, across the nine frontend test files:

| Checked area | Passing cases |
| --- | ---: |
| Management codec | 31 |
| Per-entry storage and overlapping-tab schedules | 38 |
| Actual community/backup/deletion callbacks, including owner initialization | 35 |
| Workspace reducer, including twelve retained CSV cases | 19 |
| Existing backup UI and CSV callback cases, bodies unchanged | 28 |
| Existing expense CSV, backup codec and shared-plan cases | 46 |

```sh
node --test tests/community-management.test.mjs tests/community-management-storage.test.mjs tests/community-management-ui.test.mjs tests/workspace-state.test.mjs tests/workspace-backup-ui.test.mjs tests/csv-import-state.test.mjs tests/expense-csv.test.mjs tests/workspace-backup.test.mjs tests/shared-plan.test.mjs
```

The callback adapters used the existing TypeScript 5.9.3 toolchain selected via
`TRIPPIN_TYPESCRIPT_PATH`; no installation was needed. The identical final
35-case callback harness against immutable baseline Workspace source produced
**one pass and 34 failures**, all ordinary assertions with no missing-binding
errors. The preserved pass uses an existing owner without lock support. Several
failures share missing recovery preservation, so they are not 34 distinct defects.
The baseline comparison uses the same current pure helper/reducer boundaries,
not the complete former app or a backend simulation.

The actual nine-file run also preserves the original expense/backup/shared-plan
cases. Focused source parsing passed for all five changed TypeScript sources,
with 26 local imports resolved; twenty local documentation links and whitespace
checks passed at preparation. Native Node emitted its existing typeless-package
ESM warning; package configuration was not changed to suppress it. Independent
source review found no remaining concrete blocker after per-attempt records and
coordinated first-use owner initialization replaced the initial unsafe designs.

The [HTML storage specification](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)
permits failed writes and warns against assuming cross-context locking. The
per-attempt protocol avoids writing aggregate snapshots. The
[W3C Web Locks Working Draft](https://www.w3.org/TR/2025/WD-web-locks-20250924/)
defines exclusive coordination and abortable queued requests; native lock/storage
event delivery is not executed by the callback model.

The five API files, trip/workspace transport model, trip codecs, dependencies,
lockfile and hosting configuration compare unchanged to the baseline. No local
application build, broad TypeScript compile, server, browser, backend/provider
test, model call, account, schema migration or paid service setup was performed.
The existing Git-linked Vercel build supplies hosted compilation proof separately.

Reference keys imported from legacy public flags are deterministic. Identical
removal/recreation of such a reference cannot be distinguished by key and raw
bytes alone; this does not remove fresh unique POST-attempt records. The protocol
does not serialize server POST/DELETE ordering, certify a current public state,
provide account recovery, or prevent deliberate browser-data deletion. Configured
Redis operations, native browser behavior and broader social-service acceptance
remain open. This repair does not complete the wider all-project goal.

## Source publication and hosted delivery

Published [b7bde5f](https://github.com/alvarovillalbaa/trippin/commit/b7bde5feaf3c33f2d7a94a8689979d1736391c25)
to the owner's personal repository. All fifteen changed files matched local Git
blobs through immutable GitHub readback. Workspace blob:
`c0739742a006994cc8075fd14376afe9f10c701f`; storage-adapter blob:
`7820c36726e8440142bf9e49e8ff9d45a9ec6ce0`; actual-callback test blob:
`35b58eb9d36e407601a5f6ce26352f4f09abb4e6`.

Vercel deployment
[dpl_ALfFLkCSkeE9ay2rzMDsvNaR4fWf](https://vercel.com/my-team-4f230354/trippin/ALfFLkCSkeE9ay2rzMDsvNaR4fWf)
reached production READY at that exact source. Logs record successful compilation
in 2.6 seconds, completed TypeScript checking in 3.0 seconds, EVE output creation
and build/deployment completion (15 seconds). The canonical alias lookup resolved
to this deployment. No new CI workflow or provider setup was required.

The [public app](https://trippin-theta.vercel.app/) returned HTTP 200 and referenced
that deployment. Its eight referenced script bodies returned 200. The management
client `/_next/static/immutable/chunks/2-0_g_g6ot4b6.js` contains the profile
management controls, separate attempt keys, exclusive owner initialization and
post-await ownership guard. Its connector-returned UTF-8 body is 687,185 bytes,
SHA256 `1df070bd85548ea7c941da7db309f42b970b413757072b924c5a2c812c22eaf3`;
standalone module syntax checking passed. This is compiled-client delivery proof,
not rendered UI or real transport/storage/Redis acceptance. A receipt-only
follow-up preserves the checked runtime and test source.
