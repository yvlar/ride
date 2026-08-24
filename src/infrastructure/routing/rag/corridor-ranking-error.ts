/**
 * Port-level failure when corridor ranking cannot complete (FR-029).
 * Adapters throw this; application maps it to PROVIDER_ERROR.
 * Do not put API keys or provider error bodies in the message.
 */
export class CorridorRankingError extends Error {
  readonly code = "PROVIDER_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "CorridorRankingError";
  }
}

export function isCorridorRankingError(
  error: unknown,
): error is CorridorRankingError {
  if (error instanceof CorridorRankingError) {
    return true;
  }
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { name?: unknown; message?: unknown };
  return (
    candidate.name === "CorridorRankingError" &&
    typeof candidate.message === "string"
  );
}
