# Focused browser-client integration contract

The existing creation/share and ten CSV/backup/zoom scopes are closed; their
original receipts under `docs/results/` retain their sources and proof limits.
No existing package script, historical fixture or suite is changed here.

`integration/browser/itinerary-lifecycle.mjs` declares **tier2 / integration**.
It uses the app's explicitly labeled authored Munich sample in actual fresh
Chromium contexts, actual UI controls, read-only storage observations and reload.
Application handlers, persistence and serializers are not mocked or called
directly. This focused browser-client scope does not claim a replica database,
production data, configured backend integration or full-stack E2E acceptance.

L01 runs at desktop size; L02 runs at narrow size with supported touch emulation.
Each marks the coffee stop done, toggles it back to planned and marks it done
again before reloading. It then performs skip → restore and swaps the garden
for its authored museum alternative. Actual day counts/estimates, statuses,
stable alternative IDs/time/linkage, untouched values and reloads must agree
across eleven named observations per profile.
There are exactly two identities, one browser, sequential contexts and no retry.

Invoke deliberately through `scripts/run-itinerary-lifecycle-checks.mjs`, an
operational supervisor rather than a default-suite collector. Follow the
[proposal](../docs/proposals/itinerary-lifecycle-checks.md). No app dependency,
build, server, real account, API mutation, provider or model is needed. Public
HTML/static reads stay real and each root navigation must match the pinned
deployment. APIs, weather, tiles and known fonts are blocked/counted; unexpected
reads, writes, WebSockets and page errors fail. Hashes of public responses are
observations, not compiled-source byte-equivalence proof.

Retain original partial/error outputs and source/deployment bindings before
assertions. Acceptance requires normal browser/context closure and owned
process/storage teardown. Interrupted or uncertain cleanup is not a pass.
