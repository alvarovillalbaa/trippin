import { defineAgent } from "eve";
import { tripSessionLimitReached } from "./lib/usage-limits";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  defaultTools: false,
  tool: false,
  limits: {
    sessionUsage: tripSessionLimitReached,
    sessionTimeoutMs: 2 * 60 * 60 * 1_000,
  },
  experimental: {
    workflow: { retention: 0 },
  },
});
