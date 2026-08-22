import { usesKnownUnpaved } from "@/domain/ride/constraints";
import type { RideGenerationError, RoutePreferences } from "@/domain/ride/types";
import {
  isRoutingKnowledgeError,
  unpavedKnowledgeError,
  type KnowledgeMissReason,
  type RoutingKnowledgeError,
} from "@/infrastructure/routing/routing-knowledge-error";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";

const KNOWLEDGE_REASON_PRIORITY: Record<KnowledgeMissReason, number> = {
  unpaved: 0,
  too_far: 1,
  empty: 2,
  disconnected: 3,
};

/** BR-007 — known unpaved segments are rejected after the provider returns. */
export function rejectIfKnownUnpavedAvoided(
  result: ProviderRouteResult,
  preferences: RoutePreferences | undefined,
): ProviderRouteResult {
  if (preferences?.avoidUnpaved && usesKnownUnpaved(result.segments)) {
    throw unpavedKnowledgeError();
  }
  return result;
}

export function errorFromExhaustedAttempts(
  settled: PromiseSettledResult<unknown>[],
  fallback: Pick<RideGenerationError, "message" | "suggestions">,
): RideGenerationError {
  const everyAttemptFailed =
    settled.length > 0 &&
    settled.every((result) => result.status === "rejected");
  const knowledge = primaryKnowledgeError(settled);

  if (everyAttemptFailed && knowledge) {
    return knowledgeUnavailableError(knowledge);
  }

  if (everyAttemptFailed) {
    return {
      code: "PROVIDER_ERROR",
      message:
        "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
      suggestions: ["Réessayez dans quelques instants."],
    };
  }

  return {
    code: "NO_ROUTE_FOUND",
    message: fallback.message,
    suggestions: fallback.suggestions,
  };
}

export function knowledgeUnavailableError(
  error?: RoutingKnowledgeError,
): RideGenerationError {
  if (error) {
    return {
      code: "NO_ROUTE_FOUND",
      message: error.message,
      suggestions: error.suggestions,
    };
  }

  return {
    code: "NO_ROUTE_FOUND",
    message:
      "Aucun corridor connu n’a été retrouvé pour cette demande (FR-021).",
    suggestions: [
      "Essayez un autre départ ou une autre destination.",
      "Relâchez les préférences d’évitement si elles sont actives.",
    ],
  };
}

export function allRejectedAreKnowledge(
  settled: PromiseSettledResult<unknown>[],
): boolean {
  return (
    settled.length > 0 &&
    settled.every(
      (result) =>
        result.status === "rejected" && isRoutingKnowledgeError(result.reason),
    )
  );
}

export function primaryKnowledgeError(
  settled: PromiseSettledResult<unknown>[],
): RoutingKnowledgeError | undefined {
  let selected: RoutingKnowledgeError | undefined;
  for (const result of settled) {
    if (
      result.status !== "rejected" ||
      !isRoutingKnowledgeError(result.reason)
    ) {
      continue;
    }
    if (
      !selected ||
      KNOWLEDGE_REASON_PRIORITY[result.reason.reason] <
        KNOWLEDGE_REASON_PRIORITY[selected.reason]
    ) {
      selected = result.reason;
    }
  }
  return selected;
}
