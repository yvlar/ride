import { parseEnv } from "@/lib/env";
import { MockRoutingProvider } from "./mock-routing-provider";
import { RagRoutingProvider } from "./rag/rag-routing-provider";
import type { RoutingProvider } from "./routing-provider";

export function createRoutingProvider(
  source: Record<string, string | undefined> = process.env,
): RoutingProvider {
  const env = parseEnv(source);
  if (env.ROUTING_PROVIDER === "mock") {
    return new MockRoutingProvider();
  }

  if (env.ROUTING_PROVIDER === "ai-rag") {
    return new RagRoutingProvider();
  }

  throw new Error(
    `Le fournisseur de routage « ${env.ROUTING_PROVIDER} » n’est pas encore branché. Utilisez ROUTING_PROVIDER=ai-rag ou ROUTING_PROVIDER=mock.`,
  );
}
