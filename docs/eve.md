# EVE travel assistant

Trippin uses the real `eve` runtime, `withEve` from `eve/next`, and the browser
`useEveAgent` hook from `eve/react`. The single agent lives in `agent/`. Browser
requests use same-origin `/eve/v1/*` routes. On Vercel, `withEve` generates the
agent service and routing; EVE selects Vercel Workflow for durable execution.
No separate handwritten chat endpoint or fabricated fallback answers are used.

## Activation

The assistant is disabled until **both** conditions hold in the server environment:

1. `TRIPPIN_AI_ENABLED=true`.
2. `AI_GATEWAY_API_KEY` is set, or Vercel project OIDC exposes
   `VERCEL_OIDC_TOKEN` to the runtime.

Set the environment variables on the Vercel project and redeploy. Keep all keys
server-only. The UI checks `/api/assistant-config`, which returns readiness text
and a boolean, never credentials. Readiness means configuration exists; it is
not evidence of successful provider access. Verify a real turn after activation.

The selected model is `openai/gpt-6-luna-fast` through AI Gateway. Update
`agent/agent.ts` to choose a different supported Gateway model. The application
declares `eve`, `ai`, and `zod` dependencies. EVE requires Node 24 or newer.

## Public planning boundary

The authored EVE channel fails closed while disabled or missing credentials. Its
explicit anonymous policy is only for a public, read-only planning demo. It
rejects browser requests marked cross-site. Anonymous sessions are not user
accounts: EVE route authentication does not itself enforce session ownership.
The UI keeps the session cursor in memory, does not publish session URLs, and
does not request private account data. Do not add private tools or integrations
without an application session and a server-enforced per-session ownership ACL.

Sharing the limited trip plan is opt-in and off by default. The checkbox sends
only the supplied city, dates, interests, event preferences, itinerary titles, and planning
estimates as ephemeral `clientContext` for that turn. Booking references, actual
expenses, bank data, and payment data must never enter this context. Typed chat
messages still go to the model provider and the durable EVE runtime; the UI asks
travelers to avoid sensitive details.

Only two authored, read-only tools are available:

- `calculate_trip_cost`: arithmetic over supplied transport, stay, daily food,
  transit, admissions, and contingency estimates in one currency.
- `compare_stays`: compares supplied nightly costs, fees, commute costs, commute
  durations, and optional time value.

Default shell, filesystem, web, and delegation tools are disabled. No sandbox,
provider search, purchases, trip mutations, bank connections, or messaging tools
are enabled. AI proposals are applied manually by the traveler.

Each session has a two-hour lifetime, a 30,000 input-token window, 5,000 output
tokens, and a $0.25 provider-reported token-cost window. EVE checks these after
model calls and can ask the user to continue with another window. These are not
global spending caps, rate limits, or infrastructure budgets. Set provider and
Vercel project budgets before activating a public deployment. The runtime
requests zero retention on completed Workflow runs; this does not delete model
provider records or all metadata, and the Workflow host must support retention.
Closing the panel cancels an active turn before detaching.

## Verification

After installing dependencies in an environment that passes Storage Guard:

```sh
npm run check
npm run agent:build
npm run build
```

The Vercel `withEve` integration builds the generated EVE service alongside the
frontend. For local production with `next start`, run `npm run agent:build`
first so EVE's `.output/server/index.mjs` exists.

Verify the deployed `/eve/v1/health`, then enable model credentials and send a
real browser turn. Check a budget calculation and a stay comparison. Verify
that unchecking context sharing sends no `clientContext`, Stop cancels the
running turn, provider errors remain visible, and disabling the server flag
returns `401` for session creation. A successful frontend build or health probe
does not prove a model response or durable Workflow execution.

## Sources

Implementation follows the official documentation inspected on 2026-10-20:

- [Next.js integration](https://eve.dev/docs/guides/frontend/nextjs)
- [Frontend hook and client context](https://eve.dev/docs/guides/frontend/overview)
- [Route auth and session ownership](https://eve.dev/docs/guides/auth-and-route-protection)
- [Agent limits and retention](https://eve.dev/docs/agent-config)
- [Typed tools](https://eve.dev/docs/tools)
- [Disabling default tools](https://eve.dev/docs/concepts/built-in-tools)
- [Deployment](https://eve.dev/docs/guides/deployment/overview)
