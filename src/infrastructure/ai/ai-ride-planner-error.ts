/**
 * Port-level failure when the described-ride model cannot complete (FR-034).
 * Do not put API keys or raw model output in the message.
 */
export class AiRidePlannerError extends Error {
  readonly code = "AI_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "AiRidePlannerError";
  }
}

export function isAiRidePlannerError(
  error: unknown,
): error is AiRidePlannerError {
  if (error instanceof AiRidePlannerError) {
    return true;
  }
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { name?: unknown; message?: unknown };
  return (
    candidate.name === "AiRidePlannerError" &&
    typeof candidate.message === "string"
  );
}

export const AI_UNAVAILABLE_MESSAGE = "Le service d’IA est indisponible.";
