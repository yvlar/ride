import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";

/**
 * FR-029 / BR-004 — transport-only flag. The domain schemas strip it.
 * Nested `request` covers regenerate and recalculate envelopes.
 */
export function isKnowledgeRoutingRequested(input: unknown): boolean {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const record = input as Record<string, unknown>;
  if (record.useKnowledgeRouting === true) {
    return true;
  }
  if ("request" in record) {
    return isKnowledgeRoutingRequested(record.request);
  }
  return false;
}

export function resolveRoutingProvider(
  input: unknown,
  injected?: RoutingProvider,
): RoutingProvider {
  if (injected) {
    return injected;
  }
  return createRoutingProvider(process.env, {
    knowledgeRouting: isKnowledgeRoutingRequested(input),
  });
}
