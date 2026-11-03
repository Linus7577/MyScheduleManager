import "server-only";
import { AI_DEFAULTS } from "@/config/oracle.config";
import { isAuthPreviewEnabled } from "@/lib/auth/access";
import { createPreviewProvider } from "./preview-provider";
import { createOpenAiCompatibleProvider, type AiProvider } from "./provider";

/**
 * Chooses the AI from settings alone. AI_PROVIDER names the key to use: "groq" reads GROQ_API_KEY, "other" would
 * read OTHER_API_KEY. Preview mode, with no key, uses a scripted stand-in so the screens can be tested.
 */
export function getAiProvider(): AiProvider | null {
  const provider = process.env.AI_PROVIDER || AI_DEFAULTS.provider;
  const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];

  if (apiKey && !isAuthPreviewEnabled()) {
    return createOpenAiCompatibleProvider({
      baseUrl: process.env.AI_BASE_URL || AI_DEFAULTS.baseUrl,
      model: process.env.AI_MODEL || AI_DEFAULTS.model,
      apiKey,
    });
  }

  return isAuthPreviewEnabled() ? createPreviewProvider() : null;
}
