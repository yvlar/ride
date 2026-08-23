import { parseEnv } from "@/lib/env";
import { MockRoutingProvider } from "./mock-routing-provider";
import { OsrmRoutingProvider } from "./osrm-routing-provider";
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
