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
  /** FR-034 — described rides snap via-points onto the road-network adapter only. */
  roadNetworkOnly?: boolean;
};

export function createRoutingProvider(
  source?: Record<string, string | undefined>,
  options?: CreateRoutingProviderOptions,
): RoutingProvider {
  const env = parseEnv(source ?? serverProcessEnv());

  if (options?.roadNetworkOnly) {
    return createRoadNetworkProvider(env);
  }

  if (options?.knowledgeRouting || env.ROUTING_PROVIDER === "ai-rag") {
    return createChatGptRagRoutingProvider(env);
  }

  return createRoadNetworkProvider(env);
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
    {
      // FR-029 / FR-001 — snap onto a real-road adapter when one is configured.
      // Mock stays on indexed geometry so simulated data remains explicit.
      roadNetwork:
        env.ROUTING_PROVIDER === "osrm"
          ? createOsrmRoutingProvider(env)
          : undefined,
    },
  );
}

function createRoadNetworkProvider(env: AppEnv): RoutingProvider {
  if (env.ROUTING_PROVIDER === "mock") {
    return new MockRoutingProvider();
  }

  if (env.ROUTING_PROVIDER === "osrm") {
    return createOsrmRoutingProvider(env);
  }

  throw new Error(
    `Le fournisseur de routage « ${env.ROUTING_PROVIDER} » n’est pas encore branché. Utilisez ROUTING_PROVIDER=osrm, ai-rag ou mock.`,
  );
}

function createOsrmRoutingProvider(env: AppEnv): OsrmRoutingProvider {
  if (!env.ROUTING_API_BASE_URL) {
    throw new Error(
      "ROUTING_API_BASE_URL est requis lorsque ROUTING_PROVIDER=osrm.",
    );
  }
  return new OsrmRoutingProvider(env.ROUTING_API_BASE_URL);
}
