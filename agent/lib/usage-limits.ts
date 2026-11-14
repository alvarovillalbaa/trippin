import type {TokenUsage} from 'eve';

export function tripSessionLimitReached({window}: {window: Pick<TokenUsage, 'inputTokens' | 'outputTokens' | 'costUsd'>}) {
  return window.inputTokens >= 30_000 || window.outputTokens >= 5_000 || (window.costUsd ?? 0) >= 0.25;
}
