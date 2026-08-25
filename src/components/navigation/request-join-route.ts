import type { Coordinates } from "@/domain/geo/types";
import type { RideGenerationError, RideStyle, RoutePreferences } from "@/domain/ride/types";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";

const PROVIDER_UNAVAILABLE: RideGenerationError = {
  code: "PROVIDER_ERROR",
  message:
    "Le raccordement vers le trajet GPX a échoué. Le tracé importé reste affiché.",
  suggestions: ["Réessayez dans quelques instants."],
};

export type JoinRouteClientInput = {
  start: Coordinates;
  destination: Coordinates;
  style?: RideStyle;
  preferences?: RoutePreferences;
};

export async function requestJoinRoute(
  input: JoinRouteClientInput,
  signal?: AbortSignal,
): Promise<
  { ok: true; route: ProviderRouteResult } | { ok: false; error: RideGenerationError }
> {
  let response: Response;
  try {
    response = await fetch("/api/routes/join", {
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
          message: "Ce raccordement n’est plus d’actualité.",
          suggestions: ["Le trajet GPX affiché n’a pas été modifié."],
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
