export function assistantReadiness() {
  if (process.env.TRIPPIN_AI_ENABLED !== "true") {
    return {
      enabled: false,
      reason: "disabled",
      message: "The travel assistant is awaiting activation. Your trip tools are ready to use.",
    };
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return {
      enabled: false,
      reason: "credentials_missing",
      message: "The travel assistant needs a model connection before it can reply.",
    };
  }

  return { enabled: true, reason: "ready", message: "Ready for your next idea." };
}
