# Stay comparison — first attempt failed

8 November 2026 UTC. **Failed overall; one of two cases passed.**
[Run 42446727355](https://github.com/alvarovillalbaa/trippin/actions/runs/42446727355),
job `128627103580`, checked preparation
`c8606d6dae0603d1db629ae87bd77fe86d0cc15a`, workflow
`127a6e40382ab337d985500da514100533ba3c4a`. Runtime source was
`64faf1ca70ee2989b06a1444595b2d00304b5825`, served by reviewed deployment
`dpl_9prap8D3stDKYGFBXw7Jxk4oeWx8`.

The exact [controller receipt](stay-comparison-attempt-1.json) is 544,111 bytes,
SHA256 `4003303b52b001eee35cf2f5e66cf94f369a36a6d691034799c0c01238d923d5`.
The decoded UTF-8 [original job log](stay-comparison-attempt-1.log) is
564,559 bytes, SHA256
`ffeec2c80f4183abba6e7b099ffbcbf456d7ff5f922e16839e1f57dfe4363812`.
Standalone retention verified its unique report marker and all 93 embedded
typed gzip captures with canonical base64, exact length/hash and single-member
framing. Capture integrity does not change the failed verdict.

S01 desktop completed all twelve workspace stages, 42 native input edits,
four actual root navigations and authored-trip deletion with exact baseline
restoration. S02 narrow/touch-emulated completed 42 edits, ten workspace stages
and three root navigations. Both observed default/optional-time/decimal/tie,
negative/maximum, zero-night, ignored-nightly and half-cent calculations.
The EUR 1.005 case displayed EUR 1.01. These partial observations do not accept
both case identities or supply the missing narrow deletion/restoration proof.

S02 stopped at `remove_same_day`: Playwright `locator.tap` timed out after
10 seconds waiting for **Main navigation → My trips** with mandatory two-digit
count regex `^My trips\s*\d{2}$`. No target count or DOM/badge observation was
retained at that point. The timeout establishes that composite wait; it does
not by itself distinguish absent, hidden or differently named controls.
Separate source inspection shows responsive CSS hiding the navigation count
badge. That motivates a precise optional-count matcher and future bounded
unique-visible button/badge observations; it is not a retroactive observation
of the first run's accessibility tree. No application defect is inferred from
this failure alone.

The controller error is `browser_case_status`. All four source guards passed.
The 34 command records retain their original streams and termination evidence;
the browser child returned failure. Supervisory signals were not sent. Normal
owned process/browser cleanup passed, both pages and contexts closed, pending
requests/jobs and remaining contexts were zero, and scratch removal passed.
S02's private fixture had not been removed through UI before its context closed.
This does not leave a server-side trip; no such write was admitted.

Both profiles retained zero unexpected reads, mutations, WebSockets, admitted
request failures, page errors/crashes or unexpected pages/downloads. Known
API/weather/tile/font requests were blocked and counted. Original snapshots
contain only guarded labelled samples and the disposable authored trip.
Node 24.21.0, Playwright 1.61.1 and Chromium 149.0.7827.55 define this boundary.

The separate hosted `npm run check && npm run build` passed for runtime `64faf`.
An automatic workflow-commit deployment later moved the alias; the owner
promoted the existing reviewed runtime without rebuilding, then independently
verified the canonical alias before this dispatch. Every actual root response
in this packet retained its expected deployment-ID observation. Provider source
metadata and HTML observations remain distinct; no compiled/source equality,
live provider/model/tool, booking, backend, device or full-product proof follows.

The one-off workflow was disabled after this terminal failure. Preserve this
source, log and receipt unchanged. A concrete changed test candidate must run
both cases afresh; no earlier passing case is carried into its acceptance.
