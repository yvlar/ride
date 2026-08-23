import type {
  GenerateRideRequest,
  GeneratedRideRoute,
  RideGenerationError,
} from "@/domain/ride/types";

const PROVIDER_UNAVAILABLE: RideGenerationError = {
  code: "PROVIDER_ERROR",
  message: "Le recalcul du trajet a échoué. L’itinéraire actuel reste affiché.",
  suggestions: ["Continuez sur le trajet affiché ou réessayez."],
};

export type RecalculateRideInput = {
  currentPosition: GeneratedRideRoute["start"]["coordinates"];
  progressKm: number;
  request: GenerateRideRequest;
  originalRoute: GeneratedRideRoute;
};

export async function requestRecalculatedRide(
  input: RecalculateRideInput,
  signal?: AbortSignal,
): Promise<
  { ok: true; route: GeneratedRideRoute } | { ok: false; error: RideGenerationError }
> {
  let response: Response;
  try {
    response = await fetch("/api/routes/recalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        error: {
          code: "STALE_RECALCULATE",
          message: "Ce recalcul n’est plus d’actualité.",
          suggestions: ["Le trajet affiché n’a pas été modifié."],
        },
      };
    }
    return { ok: false, error: PROVIDER_UNAVAILABLE };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: PROVIDER_UNAVAILABLE };
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null
  ) {
    return { ok: false, error: body.error as RideGenerationError };
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    typeof body.data === "object" &&
    body.data !== null &&
    "route" in body.data
  ) {
    return { ok: true, route: (body.data as { route: GeneratedRideRoute }).route };
  }

  return { ok: false, error: PROVIDER_UNAVAILABLE };
}
