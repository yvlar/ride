/**
 * Port-level failure when motorcycle web search cannot complete (FR-034).
 * Do not put API keys, queries, or raw provider bodies in the message.
 */
export class WebSearchError extends Error {
  readonly code = "WEB_SEARCH_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "WebSearchError";
  }
}

export function isWebSearchError(error: unknown): error is WebSearchError {
  if (error instanceof WebSearchError) {
    return true;
  }
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { name?: unknown; message?: unknown };
  return (
    candidate.name === "WebSearchError" && typeof candidate.message === "string"
  );
}
