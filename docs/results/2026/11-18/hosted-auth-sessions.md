# Real hosted account sessions

18 November 2026. Desktop and narrow touch-emulated Chromium pass real hosted
login, reload, provider renewal and visible logout on the canonical public app.
This supplements the earlier provider/API checks; controlled signup and the
first confirmation-link return remain unqualified.

[Run44413714162](https://github.com/alvarovillalbaa/trippin/actions/runs/44413714162)
qualifies H-A01 at1280×900 and H-A02 at390×844 in separate fresh contexts.
The checked source is `2557e2794bbae7f1ce67928272b6881b154c4766`, over production
`9657b96830c2bdbc136640a471c2cc9ca20a2977`. Each of four actual root responses
per profile binds deployment `dpl_FX3xgx3fDhvv3Hx6WK1nqzo4MWf5`.

Each case uses the original confirmed own test identity through the visible
sign-in dialog. Native cookies are host-only, Secure, HttpOnly and SameSite=Lax;
Auth JSON contains no tokens and is private/no-store. Three actual reloads
per case preserve the account, exercise renewal, then confirm anonymous logout.
Renewal deliberately removes only the access cookie while retaining refresh;
the real provider reissues access and rotates refresh. This is an authored
missing-access boundary, not acceptance of real elapsed token expiry.

Four anonymous screenshots, taken before entering credentials, were inspected:
the landing page and sign-in dialog are legible and contained on both layouts,
with visible focus on Email. Actual DM Sans400 and Manrope700 faces are loaded.
No sidebar, top-level Discover destination, fictional trip or horizontal
overflow is observed. These are emulated profiles, not physical-device or
assistive-technology acceptance.

Both cases record four session requests, one login and one logout, with no
refused network request, page error or unexpected console error. Provider-local
revocation is confirmed by the app; native cookies clear and the final reload
is anonymous. Browser contexts, Chromium, seven managed process groups and
owned scratch/private output close normally. The208 source inputs and all
23 supporting request/privacy/ownership controls pass independent review.

The first invocation failed before credential entry because its checker asked
for an unused font weight. Its20-second result remains failed and unchanged.
The corrected invocation uses37 actual CI seconds; cumulative57 seconds and
both unused invocation budgets are closed. Both workflows are disabled, both
QA refs deleted, all four temporary encrypted inputs deleted with404 readbacks,
and neither QA branch created a Vercel deployment. Main and the served
production remain unchanged by this packet. Original private inputs remain600
and byte-preserved.

No new account, email, provider configuration, model, booking, bank connection
or application dependency install/build/server was part of this packet. No
credentials, links, cookies, traces, HAR, video or authenticated screenshot
were published. Local Storage Guard failed at13.1GiB against34GiB required;
only the approved isolated public runner executed Chromium.
