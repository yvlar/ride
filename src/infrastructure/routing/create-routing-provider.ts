import type { AppEnv } from "@/lib/env";
import { parseEnv, serverProcessEnv } from "@/lib/env";
import { MockRoutingProvider } from "./mock-routing-provider";
import { OsrmRoutingProvider } from "./osrm-routing-provider";
import { ChatGptCorridorRetriever } from "./rag/chatgpt-corridor-retriever";
import {
  HttpChatCompletionsClient,
  normalizeChatApiKey,
  resolveChatCompletionsBaseUrl,
  resolveChatCompletionsModel,
} from "./rag/chat-completions-client";
import { RagRoutingProvider } from "./rag/rag-routing-provider";
import type { RoutingProvider } from "./routing-provider";

export const MISSING_CHAT_API_KEY_MESSAGE =
  "OPENAI_API_KEY est requis pour Corridors RAG. Définissez la clé côté serveur.";

export type CreateRoutingProviderOptions = {
  /** FR-029 — per-request override to the knowledge/RAG adapter. */
  knowledgeRouting?: boolean;
};

export function createRoutingProvider(
  source?: Record<string, string | undefined>,
  options?: CreateRoutingProviderOptions,
): RoutingProvider {
  const env = parseEnv(source ?? serverProcessEnv());

  if (options?.knowledgeRouting) {
    return createChatGptRagRoutingProvider(env);
  }
  if (env.ROUTING_PROVIDER === "mock") {
    return new MockRoutingProvider();
  }

  if (env.ROUTING_PROVIDER === "ai-rag") {
    return createChatGptRagRoutingProvider(env);
  }

  if (env.ROUTING_PROVIDER === "osrm") {
    if (!env.ROUTING_API_BASE_URL) {
      throw new Error(
        "ROUTING_API_BASE_URL est requis lorsque ROUTING_PROVIDER=osrm.",
      );
    }
    return new OsrmRoutingProvider(env.ROUTING_API_BASE_URL);
  }

  throw new Error(
    `Le fournisseur de routage « ${env.ROUTING_PROVIDER} » n’est pas encore branché. Utilisez ROUTING_PROVIDER=osrm, ai-rag ou mock.`,
  );
}

function createChatGptRagRoutingProvider(env: AppEnv): RagRoutingProvider {
  const apiKey = normalizeChatApiKey(env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error(MISSING_CHAT_API_KEY_MESSAGE);
  }

  const baseUrl = resolveChatCompletionsBaseUrl({
    apiKey,
    baseUrl: env.OPENAI_API_BASE_URL,
  });

  return new RagRoutingProvider(
    new ChatGptCorridorRetriever({
      client: new HttpChatCompletionsClient({
        apiKey,
        baseUrl,
      }),
      model: resolveChatCompletionsModel({
        model: env.OPENAI_MODEL,
        baseUrl,
      }),
    }),
  );
}
