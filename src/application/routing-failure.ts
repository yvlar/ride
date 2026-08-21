import type { RideGenerationError } from "@/domain/ride/types";
import {
  isRoutingKnowledgeError,
  type KnowledgeMissReason,
  type RoutingKnowledgeError,
} from "@/infrastructure/routing/rag/routing-knowledge-error";

const KNOWLEDGE_REASON_PRIORITY: Record<KnowledgeMissReason, number> = {
  unpaved: 0,
  too_far: 1,
  empty: 2,
  disconnected: 3,
};

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
