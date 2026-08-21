export class RoutingKnowledgeError extends Error {
  readonly code = "NO_ROUTE_FOUND" as const;

  constructor(
    message = "Aucun corridor connu n’a été retrouvé pour cette demande (FR-021).",
    readonly suggestions: string[] = [
      "Essayez un autre départ ou une autre destination.",
      "Relâchez les préférences d’évitement si elles sont actives.",
    ],
  ) {
    super(message);
    this.name = "RoutingKnowledgeError";
  }
}

export function isRoutingKnowledgeError(
  error: unknown,
): error is RoutingKnowledgeError {
  return error instanceof RoutingKnowledgeError;
}
