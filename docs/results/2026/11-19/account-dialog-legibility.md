# Account dialog legibility

19 November2026. Actual hosted390px confirmation-error screenshots exposed
9px pale device-storage guidance and an11px low-contrast dialog alert. These
messages explain account data ownership and how to recover after a failed link.

Two CSS overrides scoped to the consumer entry increase helper text to12px and
alerts to13px, with1.65 line height and darker foreground colors. Global form
styles, layout, account admission and data behavior are unchanged. The selected
foreground/background pairs exceed the
[W3C4.5:1 normal-text contrast threshold](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
This is a check of these text pairs, not a whole-app accessibility claim.
Declared-color calculations improve the device note from2.30:1 to6.18:1
against the paper background, and the alert from3.47:1 to6.65:1 against its
existing cream background. Removing exactly the two new scoped rules restores
the published stylesheet hash; no other stylesheet bytes change.

The prior H-U01 hosted authored-error check passes actual fragment scrubbing,
sanitized alerts, blank login fields, Email focus and contained390px dialog
geometry at main63bd8566; its screenshots motivated this change. It does not
qualify the new CSS. PR6 separately ships the two-rule repair at main
`c5edeabdf8a0ee1199f6dd4149f2b4ea809b3909`, with Preview/production Next/types/Eve
builds and actual canonical/immutable HTML agreement.

Fresh [H-U02/run44427511057](https://github.com/alvarovillalbaa/trippin/actions/runs/44427511057)
at [checked source6b21bead](https://github.com/alvarovillalbaa/trippin/commit/6b21beade2f9e706b7403e7b1d016c5beb851b0c)
verifies actual computed12px helper text at6.1783:1 and13px alert text at6.6502:1.
The empty, focused login dialog stays inside390×844. Both anonymous screenshots
were inspected; the larger/darker message and device-storage explanation are
readable. The home frame precedes completed hero-image loading, so it qualifies
text/error geometry only, not the whole landing/photo load.

All213 source inputs,29 supporting controls, the Chromium redirect/refusal
control and normal source/process/browser/tool fixture/scratch/privacy closure
pass independent review. The28 actual CI seconds and872 unused seconds are
closed; workflow/ref retirement and zero QA Vercel deployments are read back.
No credentials, account, email or provider link were used. Real signup/first
click is qualified by the separate [fresh hosted packet](hosted-auth-confirmation.md).
