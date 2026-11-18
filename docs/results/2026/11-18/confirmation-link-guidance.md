# Guidance for expired or used confirmation links

18 November 2026. A failed email return now explains that the link may have
expired or already been used. Users who already confirmed their email can try
**Log in**; otherwise they are directed to their latest confirmation email.
Previously, every failed return told users to open another confirmation email
before logging in, even when the account was already confirmed.

The existing direct-link receipt found exactly that combination: a consumed
token and the same confirmed own identity accepted by ordinary password login.
Its consumption cause remains unknown. Supabase also documents that
[email prefetching can consume single-use links](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching);
that possibility is not a diagnosis of this retained failure.

Only the sanitized message and its expected test text change. The URL fragment
is still removed before account lookup; neither the fragment nor a raw provider
description supplies an identity or confirmation claim. Existing server-verified
sessions, query/shared-trip intent, lookup uncertainty, unmount fencing and
dialog focus handling remain intact.

Eight focused confirmation-return controls pass on Node24.21.0 using an existing
read-only TypeScript5.9.3 installation. They execute actual extracted handler
and rendering source with authored URL/history/account replies; they do not
mount React or contact a provider. `git diff --check` passes. Vercel Preview and
production build/served-source checks are recorded on the release PR after
publication. Native signup and controlled first-click return remain pending;
the separate hosted-session result qualifies existing-account sessions only.
