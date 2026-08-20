import { parseEnv } from "@/lib/env";
import { MockRoutingProvider } from "./mock-routing-provider";
import type { RoutingProvider } from "./routing-provider";

export function createRoutingProvider(
  source: Record<string, string | undefined> = process.env,
): RoutingProvider {
  const env = parseEnv(source);
  if (env.ROUTING_PROVIDER === "mock") {
    return new MockRoutingProvider();
  }

  throw new Error(
    `Le fournisseur de routage « ${env.ROUTING_PROVIDER} » n’est pas encore branché. Utilisez ROUTING_PROVIDER=mock.`,
  );
}
