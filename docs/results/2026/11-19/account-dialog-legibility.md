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
qualify the new CSS. Deployment build/served-source checks and a fresh rendered
check will be recorded on the release PR. The one-use signup/confirmation
packet remains separate and respects its existing email-rate window.
