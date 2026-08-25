import { parseEnv, serverProcessEnv } from "@/lib/env";
import { normalizeChatApiKey } from "@/infrastructure/routing/rag/chat-completions-client";
import {
  HttpWebSearchProvider,
  WEB_SEARCH_MISSING_KEY_MESSAGE,
} from "./http-web-search-provider";
import { OpenAiWebSearchProvider } from "./openai-web-search-provider";
import { WebSearchError } from "./web-search-error";
import type { WebSearchProvider } from "./web-search-provider";

export function createWebSearchProvider(
  source?: Record<string, string | undefined>,
): WebSearchProvider {
  const env = parseEnv(source ?? serverProcessEnv());
  const dedicatedKey = env.WEB_SEARCH_API_KEY?.trim();
  const provider = env.WEB_SEARCH_PROVIDER;

  if (usesDedicatedSearchKey(provider, dedicatedKey)) {
    if (!dedicatedKey) {
      throw new WebSearchError(WEB_SEARCH_MISSING_KEY_MESSAGE);
    }
    return new HttpWebSearchProvider({
      provider: provider === "brave" ? "brave" : "tavily",
      apiKey: dedicatedKey,
      baseUrl: env.WEB_SEARCH_API_BASE_URL,
    });
  }

  const chatKey = normalizeChatApiKey(env.OPENAI_API_KEY);
  if (!chatKey) {
    throw new WebSearchError(WEB_SEARCH_MISSING_KEY_MESSAGE);
  }

  return new OpenAiWebSearchProvider({
    apiKey: chatKey,
    baseUrl: env.OPENAI_API_BASE_URL,
    model: env.OPENAI_MODEL,
  });
}

function usesDedicatedSearchKey(
  provider: "tavily" | "brave" | "openai" | undefined,
  dedicatedKey: string | undefined,
): boolean {
  if (provider === "openai") {
    return false;
  }
  return provider === "tavily" || provider === "brave" || Boolean(dedicatedKey);
}
