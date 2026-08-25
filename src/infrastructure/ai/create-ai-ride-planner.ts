import { parseEnv, serverProcessEnv } from "@/lib/env";
import {
  HttpChatCompletionsClient,
  normalizeChatApiKey,
  resolveChatCompletionsBaseUrl,
  resolveChatCompletionsModel,
} from "@/infrastructure/routing/rag/chat-completions-client";
import { HttpAiRidePlanner } from "./http-ai-ride-planner";
import {
  AI_UNAVAILABLE_MESSAGE,
  AiRidePlannerError,
} from "./ai-ride-planner-error";
import type { AiRidePlanner } from "./ai-ride-planner";

export function createAiRidePlanner(
  source?: Record<string, string | undefined>,
): AiRidePlanner {
  const env = parseEnv(source ?? serverProcessEnv());
  const apiKey = normalizeChatApiKey(env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
  }
  const baseUrl = resolveChatCompletionsBaseUrl({
    apiKey,
    baseUrl: env.OPENAI_API_BASE_URL,
  });
  return new HttpAiRidePlanner({
    client: new HttpChatCompletionsClient({
      apiKey,
      baseUrl,
      timeoutMs: 20_000,
    }),
    model: resolveChatCompletionsModel({
      model: env.OPENAI_MODEL,
      baseUrl,
    }),
  });
}
