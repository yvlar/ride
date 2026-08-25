import { parseEnv, serverProcessEnv } from "@/lib/env";
import {
  HttpWebSearchProvider,
  WEB_SEARCH_MISSING_KEY_MESSAGE,
} from "./http-web-search-provider";
import { WebSearchError } from "./web-search-error";
import type { WebSearchProvider } from "./web-search-provider";

export function createWebSearchProvider(
  source?: Record<string, string | undefined>,
): WebSearchProvider {
  const env = parseEnv(source ?? serverProcessEnv());
  const apiKey = env.WEB_SEARCH_API_KEY?.trim();
  if (!apiKey) {
    throw new WebSearchError(WEB_SEARCH_MISSING_KEY_MESSAGE);
  }
  return new HttpWebSearchProvider({
    provider: env.WEB_SEARCH_PROVIDER ?? "tavily",
    apiKey,
    baseUrl: env.WEB_SEARCH_API_BASE_URL,
  });
}
