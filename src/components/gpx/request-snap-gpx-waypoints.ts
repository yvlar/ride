import type { Coordinates } from "@/domain/geo/types";
import type { RideGenerationError, RideStyle, RoutePreferences } from "@/domain/ride/types";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";

const PROVIDER_UNAVAILABLE: RideGenerationError = {
  code: "PROVIDER_ERROR",
  message: "Le moteur de routage n’a pas pu relier les points de la route GPX.",
  suggestions: ["Réessayez dans quelques instants."],
};

export async function requestSnapGpxWaypoints(
  input: {
    waypoints: Coordinates[];
    style?: RideStyle;
    preferences?: RoutePreferences;
  },
  signal?: AbortSignal,
): Promise<
  { ok: true; route: ProviderRouteResult } | { ok: false; error: RideGenerationError }
> {
  let response: Response;
  try {
    response = await fetch("/api/routes/snap-waypoints", {
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
          message: "Cette requête n’est plus d’actualité.",
          suggestions: ["Réimportez le fichier si besoin."],
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
    return {
      ok: true,
      route: (body.data as { route: ProviderRouteResult }).route,
    };
  }

  return { ok: false, error: PROVIDER_UNAVAILABLE };
}
