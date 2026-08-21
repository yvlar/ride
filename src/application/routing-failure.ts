import type { RideGenerationError } from "@/domain/ride/types";
import { isRoutingKnowledgeError } from "@/infrastructure/routing/rag/routing-knowledge-error";

export function knowledgeUnavailableError(): RideGenerationError {
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
