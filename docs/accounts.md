# Accounts and device-local trips

Last updated: 2026-11-18

The consumer iteration adds signup, login, session lookup/refresh and local sign-out at `app/api/auth/route.ts`. It uses the hosted [Supabase Auth REST contract](https://github.com/supabase/auth/blob/master/openapi.yaml) through fixed server-side paths, without a new dependency or database migration. The [dated release status](results/2026/11-16/consumer-release-status.md#current-status) distinguishes source checks, isolated application acceptance and real provider qualification. Consumer deployment and hosted real-provider application acceptance remain pending.

## Required configuration

Use the dedicated Trippin project `erxeujubtgkxppmuncdy`. Its production Site URL is `https://trippin-theta.vercel.app`, with exact permitted return `https://trippin-theta.vercel.app/`. Confirmation remains required, anonymous users disabled and email/signup enabled. The two server Auth variables are stored as production-only sensitive values. These are completed configuration boundaries; see [provider and Auth configuration](results/2026/11-16/consumer-release-status.md#provider-and-auth-configuration) for the dated evidence and limits. Runtime use and a confirmation return through the hosted consumer app remain unverified.

The configured sender is `hello@clous.app`. The separately approved confirmation-template correction adds `ses:no-track` to its existing link. A fresh actual email passed SPF/DKIM/DMARC and contained the direct HTTPS provider link. Our controlled verification returned `otp_expired`; password login and `/user` verified that same fresh account was already confirmed, followed by local logout204. The consumption cause and controlled first-click journey remain unproven. The original tracked-link HTTP failure is preserved. See the [pending release gates](results/2026/11-16/consumer-release-status.md#pending-release-gates).

Configure server-only `TRIPPIN_SUPABASE_URL` and `TRIPPIN_SUPABASE_PUBLISHABLE_KEY` as shown in `.env.example`. Use a publishable/anonymous key, not a service-role key. The implementation accepts HTTPS project hosts under `supabase.co`; custom/self-hosted Auth domains are outside this adapter. Configure the project's email/password policy, production Site URL and permitted return URL, plus working confirmation-email delivery. Preserve confirmation/CAPTCHA policies; missing or rejected configuration must be resolved at its owner, not bypassed in the app.

[Supabase's signup documentation](https://supabase.com/docs/reference/javascript/auth-signup) distinguishes accepted signup, email confirmation and an authenticated session. This implementation returns an email-confirmation message when signup has no session. It does not treat an unconfirmed user record or URL fragment as login. Confirmation fragments are removed from the visible URL and the user signs in normally afterward. Failed `#error=` returns show a sanitized alert; raw provider descriptions and fragment tokens are never displayed or admitted as a session.

## Session boundary

The browser sends credentials only to the app's same-origin JSON endpoint. The server calls `/signup`, `/token` and `/user`; identity comes from a provider-verified user response. Access/refresh tokens stay in host-only HttpOnly, SameSite=Lax cookies, Secure on HTTPS/production. Tokens never enter response JSON, browser storage, trip backups, the AI context or logs. Requests require the app's Origin, bodies are bounded to 16 KiB, provider requests have five-second timeouts, and session responses are private/no-store. Provider rejection, throttling and service failures have separate visible error responses.

Refresh runs through the same server endpoint. Sign-out clears this browser's cookies and requests provider-local revocation; only the provider's 204 response confirms that request. Failed or malformed revocation reports uncertainty separately. Lost/unreadable/transient account replies cause one fresh session lookup, without resending credentials. If status remains unknown, a distinct status check is required before another credential submit; guest planning remains available. Password recovery, OAuth and cross-tab/provider refresh concurrency remain unqualified. Native application cookies have isolated authored-provider evidence; real-provider hosted cookies remain unverified.

Admission requires a confirmed nonanonymous provider user. Body fields, UUID/email,
token bounds and public-key class are checked; privileged keys are refused. Request
JSON is limited to 16 KiB and provider JSON to 64 KiB with five-second read deadlines.
Display names are presentation only, never authorization. See the provider's
[API-key contract](https://supabase.com/docs/guides/getting-started/api-keys).

## Data boundary

### Corrupt-space recovery continuation

An explicit recovery dialog appears when a valid backup is selected for a corrupt
namespace. It archives and verifies the original before replacement, preserves
scoped public-plan access and other spaces, refuses stale choices and offers
original-archive downloads after reload. Normal automatic overwrite refusal is
unchanged. Recovery needs Web Locks, an input of at most 40 source trips and at
most 256 final scoped owner/journal entries; larger or unsupported public data
keeps its lossless download/manual-recovery path. Recovery envelopes are not
ordinary trip backups. The fresh isolated packet now passes 93 controls, Next/Eve builds and two desktop
Chromium cases including native Web Locks, actual file selection, archive ordering,
reload and downloads. It remains Tier 2 with an authored corruption fixture, not
real-provider hosted application acceptance. See the
[source and qualification boundary](results/2026/11-16/consumer-release-status.md#source-and-isolated-qualification).

Authentication does not upload or synchronize trips. Each verified account has a `trippin.workspace.v2.user.<uuid>` namespace; guest planning uses `trippin.workspace.v2.guest`. Public-plan capability and management keys are scoped separately to the same account. Signing out does not delete account trips. Guest data is not silently imported into an account; users can explicitly restore a backup in their chosen space.

The old `trippin.workspace.v1` remains untouched. Legacy guest trips can be projected into the new guest space; only the exact original sample profile becomes blank. Its existing daily allowances become trip overrides so old projected totals remain identical. Food and transport retain their existing whole-trip minimum: the higher of known category costs or daily allowance multiplied by trip days. Corrupt data is preserved, saving over it is refused, and a raw recovery download is available. The public community API still uses its original capability contract: adding login does not establish a server-side account ACL for that separate service. Production account operation requires actual Auth configuration and end-to-end qualification, not just the local data checks.
