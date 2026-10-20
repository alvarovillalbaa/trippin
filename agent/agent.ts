import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  defaultTools: false,
  tool: false,
  limits: {
    maxInputTokensPerSession: 30_000,
    maxOutputTokensPerSession: 5_000,
    maxTokenCostUsdPerSession: 0.25,
    sessionTimeoutMs: 2 * 60 * 60 * 1_000,
  },
  experimental: {
    workflow: { retention: 0 },
  },
});
