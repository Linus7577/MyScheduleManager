/** Protects the free quota. Requests beyond this in a minute get an in-character refusal. */
export const AI_RATE_LIMIT_PER_MINUTE = 20;

/** A safety limit on model-and-tool rounds in one reply, so a confused model can't loop and burn quota. */
export const MAX_TOOL_ROUNDS = 4;

/** Free tiers have low tokens-per-minute, so context stays short. About 4 characters make one token in English. */
export const MAX_CONTEXT_CHARS = 3500;
export const MAX_HISTORY_MESSAGES = 6;
export const MAX_HISTORY_MESSAGE_CHARS = 800;
export const MAX_TOOL_RESULT_CHARS = 3000;
export const MAX_REPLY_TOKENS = 700;
export const MAX_MESSAGE_CHARS = 2000;

export const PROPOSAL_EXPIRY_HOURS = 48;
export const UNDO_WINDOW_DAYS = 7;
export const SUGGESTIONS_PER_DAY = 3;

export const RATE_LIMIT_RETRIES = 2;
export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_WAIT_MS = 20_000;

export const AI_DEFAULTS = {
  provider: "groq",
  baseUrl: "https://api.groq.com/openai/v1",
  model: "openai/gpt-oss-20b",
} as const;
