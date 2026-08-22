export type KnowledgeMissReason =
  | "empty"
  | "disconnected"
  | "unpaved"
  | "too_far";

const KNOWLEDGE_MISS_REASONS = new Set<string>([
  "empty",
  "disconnected",
  "unpaved",
  "too_far",
]);

export function isKnowledgeMissReason(
  value: unknown,
): value is KnowledgeMissReason {
  return typeof value === "string" && KNOWLEDGE_MISS_REASONS.has(value);
}

/**
 * Port-level failure when retrieved knowledge cannot satisfy a request
 * (NFR-005). Adapters throw this; application maps it to FR-021.
 */
export class RoutingKnowledgeError extends Error {
  readonly code = "NO_ROUTE_FOUND" as const;

  constructor(
    readonly reason: KnowledgeMissReason,
    message: string,
    readonly suggestions: string[],
  ) {
    super(message);
    this.name = "RoutingKnowledgeError";
  }
}

export function isRoutingKnowledgeError(
  error: unknown,
): error is RoutingKnowledgeError {
  if (error instanceof RoutingKnowledgeError) {
    return true;
  }
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as {
    name?: unknown;
    reason?: unknown;
    message?: unknown;
    suggestions?: unknown;
  };
  return (
    candidate.name === "RoutingKnowledgeError" &&
    isKnowledgeMissReason(candidate.reason) &&
    typeof candidate.message === "string" &&
    Array.isArray(candidate.suggestions) &&
    candidate.suggestions.every((item) => typeof item === "string")
  );
}

export function emptyKnowledgeError(): RoutingKnowledgeError {
  return new RoutingKnowledgeError(
    "empty",
    "Aucun corridor connu n’a été retrouvé près de cette demande (FR-021).",
    ["Essayez un autre départ ou une autre destination."],
  );
}

export function disconnectedKnowledgeError(): RoutingKnowledgeError {
  return new RoutingKnowledgeError(
    "disconnected",
    "Les corridors connus ne relient pas ce départ à cette destination (FR-021).",
    ["Essayez un autre couple départ / destination."],
  );
}

export function unpavedKnowledgeError(): RoutingKnowledgeError {
  return new RoutingKnowledgeError(
    "unpaved",
    "Éviter les routes non pavées empêche de construire ce trajet (FR-021).",
    [
      "Désactivez « éviter les routes non pavées ».",
      "Essayez un autre départ.",
    ],
  );
}

export function tooFarKnowledgeError(): RoutingKnowledgeError {
  return new RoutingKnowledgeError(
    "too_far",
    "La distance demandée dépasse la zone indexable du graphe local (FR-021).",
    ["Réduisez la distance ou la séparation départ / destination."],
  );
}
