# Repeat signup and password recovery

The owner reported a signup without an email on 19 November. The dedicated
Trippin provider recorded `user_repeated_signup` with HTTP 200 at 10:34:39 UTC.
The address was already confirmed by the earlier authorized provider test.
The signup reply did not request a new confirmation email or replace the password.
Trippin's unconditional instruction to look for confirmation was misleading.

Signup now gives conditional guidance for new and existing accounts. The login
dialog offers password recovery through a code sent by the configured Auth
mailer. The recovery template sends an 8-digit code as text, so mailbox link
scanners do not consume it. The server verifies a recovery code against the
email, updates the password through Supabase and requests revocation of the
recovery session. The browser signs in separately with the newly chosen password.
The original signup confirmation requirement and rate limits still apply.
