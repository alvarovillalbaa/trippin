# Reproducible dependency review

14 November2026. The owner's standing approval covers dependency/CI changes and
focused checks needed to finish the apps. The flight-clock build reported two
vulnerabilities without identifying their advisory paths. Main914b731d has no
lockfile, so those historical build counts do not identify today's dependency
graph. Do not infer affected packages from the counts.

Use a temporary push workflow restricted to the owned public
`qa/trippin-dependencies-20261114` branch, read-only repository permission and
pinned Node24.21.0/actions. One Ubuntu job per changed manifest/control candidate,
at most15 minutes. Resolve with lifecycle scripts disabled, public npm registry
and an isolated cache/user config. Retain exact manifest/lock/audit/command output
and source/version hashes. An audit finding is inspection data; registry/JSON or
command errors fail the job rather than being treated as clean.

After reading advisory-backed affected/fixed ranges, prepare only necessary
supported updates and retain the first lock to avoid unrelated resolutions.
A changed manifest with that baseline lock may run a second job: resolve/audit,
then, only if the audit is clean, fresh `npm ci`, the EVE/Next builds and
`npm run check`. Its generated lock is accepted only if the committed bytes
match the artifact and manifest exactly. Do not run earlier accepted travel
suites. Preserve failures, source guards and owned runner cleanup; retire the
temporary workflow and branch after terminal qualification/publication.

No private workspace, provider/model/bank call, account, purchase, database,
production Auth setting, paid plan or local heavy environment. Local Storage
Guard reports2.3GiB versus34GiB required, so no local install/build is allowed.
Build/lock/audit evidence does not prove browser or live-provider behavior.
