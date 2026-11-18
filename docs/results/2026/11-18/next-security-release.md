# Next.js security repair

18 November 2026. The dependency change pins Next16.4.2→16.4.6, including
`@next/env` and all eight platform SWC packages. npm regenerated the lock;
independent comparison verifies exactly those ten entries and the root pin
changed, while108 unrelated package entries remain equal. No application,
Auth, SMTP, DNS or provider configuration changes are included.

The patch addresses the affected version ranges in the official
[cache nesting advisory](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h)
and [cache metadata advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vc7v-qv4w-wrv8).
Their documented cache/root-param prerequisites are absent from this app;
that source inference is separate from the package repair and is not an
exploit reproduction or a whole-application security assessment.

## Qualified generated input

[Checked source](https://github.com/alvarovillalbaa/trippin/commit/bb4e731025f96bdc2983e1553ae7547fd4dede28)
preserves all196 PR3-main blobs and adds only eight QA inputs. Its
[fresh qualification](https://github.com/alvarovillalbaa/trippin/actions/runs/44396551087)
uses a separate workflow head `7f1e881acf826c8507d190dbf250ccfc949d804d` and one
Ubuntu job lasting58 actual seconds, with pinned Node24.21.0/npm11.19.0.
The generated pair is installed in
[dependency commit](https://github.com/alvarovillalbaa/trippin/commit/d39efd2750ead4a6b202a8338b2fb7035ac62e25):

- Manifest SHA256 `ffda0d12932dd3bc90e66deda60fb91d03d6338566d84b263c482e6a1e2221e3`.
- Lock SHA256 `5a3bcf2671a2377b91cafaded2f6f491aaa2453351bc1e70deb71e560ca60820`.

The complete audit explicitly includes production, development, optional and
peer dependencies and reports zero vulnerabilities. Fresh install disables
lifecycle scripts. All42 selected Auth/confirmation/entry/usage controls, seven
authored ownership/environment controls, Next type generation, TypeScript,
Next build and full Eve build pass. Final dependency bytes match the index.
Every204 source-input hash/byte count/mode independently binds to its expected
remote Git blob or frozen QA addition. All thirteen commands exit normally;
process groups/workers, generated outputs, scratch and untracked residue are
absent after cleanup, with original source/HOME restored.

The original ZIP digest is
`364c5b61c45d232e2a2b3529876ff9c8529c6b087dbbf6939531bb89e1c5ea5c`.
Independent artifact and source review agrees with the qualified pair. The
temporary workflow is disabled, its active file retired and owned ref deleted
with404 readback. Exact-branch Vercel readback returns zero QA deployments.

## Earlier results and release boundary

The first50-second run failed on a detached worker and never reached source/file
cleanup. Its PID's purpose remains unproven. The changed second57-second run
passed runtime guards but omitted explicit development-dependency audit coverage
under production NODE_ENV; review rejected its complete-audit claim. Both remain
unaccepted and unchanged. The third run repeats every gate afresh, with explicit
dependency inclusion, telemetry opt-out, complete output cleanup and no worker
exemption. Total qualification CI is165 seconds; every invocation's unused time
and identities are closed.

Publish only the qualified two-file pair and curated public documentation as an
overlay on full main. QA workflow/refusal files and raw operator artifacts stay
outside that release. The release PR records exact-head Preview, merge,
production, served HTML/asset and anonymous Auth/compression outcomes after their
separate checks. The PR3 production deployment remains the rollback target for
a demonstrated critical release regression.

This qualification does not establish real-provider native browser cookies,
rendered confirmation return, reload, renewal or controlled first click.
Earlier hosted Auth API evidence belongs to its recorded consumer activation;
its mailbox allowance remains closed. No account, email or model call occurred
in this dependency qualification. Local heavy runtime remains subject to
Storage Guard; no storage exception was used.
