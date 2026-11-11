# Story card and profile verification

Both desktop and narrow touch-emulated Chromium journeys passed against
Trippin's public deployment `dpl_8aMRSmgz8FGEvfdSVdfZCU3eyM7W`, serving
`c4103cade48221d264aeaedbcde7ac0c879f072e`. The check source is
`a0ac95b2237a0be1ffefec3427e2a14bc06f40cd`. [CI run](https://github.com/alvarovillalbaa/trippin/actions/runs/42988063370)

Each journey downloaded the initial story card, marked the coffee and lunch
stops complete, and verified that the two moments counted as one place.
Completing the sample community event earned the country and event badges.
After reload, the card showed four days, two places and three moments.
Undoing the event removed its badge. Undoing the remaining marks restored the
exact original workspace, including after a second reload.

Four actual downloads completed as 1080 by 1350 PNGs. The desktop and narrow
exports matched byte for byte at each stage. Inspection of the retained images
confirmed the city photo, profile name, dates and the change from 4/0/0 to 4/2/3.
The downloads left saved data intact. Both profile screenshots showed the
expected badges and card. Their fixed navigation and skip link appear at the
capture's scroll position in the full-page image.

- [Initial PNG](story-before-completion.png)
- [Completed PNG](story-after-completion.png)
- [Desktop profile](desktop-profile.png)
- [Narrow profile](narrow-profile.png)
- [Verified observations and image hashes](story-profile.json)
- [Full checked source hashes](story-profile-source.sha256)

The run used Playwright 1.65.0 and Chromium 158.0.8127.18, one worker and zero
retries. All 134 checked source files matched. Both contexts closed with zero
pending requests or routing jobs. The runner confirmed browser process closure
and removed its temporary tools. The one-off workflow was disabled after the run.

The JSON receipt projects observations verified against the original runner
report, whose byte count and hash it retains. GitHub retains that original report
in its one-day artifact. The four images above are retained independently here.
API, weather, tile and external font requests were blocked and counted.
These checks cover private browser data and self-reported sample completion.
Configured providers, public sharing, event attendance, copied-event
deduplication, other browsers and physical devices remain outside this packet.
