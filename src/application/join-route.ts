import type { Coordinates } from "@/domain/geo/types";
import type { RideStyle, RoutePreferences } from "@/domain/ride/types";
import { resolveRoutingProvider } from "@/application/resolve-routing-provider";
import type {
  ProviderRouteResult,
  RoutingProvider,
  RoutingProviderOptions,
} from "@/infrastructure/routing/routing-provider";
import {
  applyHardRoutePreferences,
  stayInCanadaEndpointError,
} from "./routing-failure";
import type { RideGenerationError } from "@/domain/ride/types";

export type JoinRouteInput = {
  start: Coordinates;
  destination: Coordinates;
  style?: RideStyle;
  preferences?: RoutePreferences;
};

export type JoinRouteResult =
  | { ok: true; route: ProviderRouteResult }
  | { ok: false; error: RideGenerationError };

/**
 * FR-039 / BR-010 — routable connector only. Never replaces a GPX trace.
 */
export async function joinRoute(
  input: JoinRouteInput,
  routingProvider?: RoutingProvider,
  options?: RoutingProviderOptions,
): Promise<JoinRouteResult> {
  const preferences: RoutePreferences = input.preferences ?? {
    avoidHighways: false,
    avoidUnpaved: false,
  };
  const endpointError = stayInCanadaEndpointError(
    input.start,
    input.destination,
    preferences.stayInCanada,
  );
  if (endpointError) {
    return { ok: false, error: endpointError };
  }

  let provider: RoutingProvider;
  try {
    provider = resolveRoutingProvider(
      {
        type: "destination",
        start: { label: "Départ", coordinates: input.start },
        destination: { label: "Arrivée", coordinates: input.destination },
        style: input.style ?? "touring",
        preferences,
      },
      routingProvider,
    );
  } catch {
    return {
      ok: false,
      error: {
        code: "PROVIDER_ERROR",
        message:
          "Le raccordement vers le trajet GPX a échoué. Le tracé importé reste affiché.",
        suggestions: ["Réessayez dans quelques instants."],
      },
    };
  }

  try {
    const connector = applyHardRoutePreferences(
      await provider.calculateRoute(
        {
          start: input.start,
          destination: input.destination,
          style: input.style,
          preferences,
        },
        { signal: options?.signal },
      ),
      preferences,
    );
    if (options?.signal?.aborted) {
      return {
        ok: false,
        error: {
          code: "STALE_RECALCULATE",
          message: "Ce raccordement n’est plus d’actualité.",
          suggestions: ["Le trajet GPX affiché n’a pas été modifié."],
        },
      };
    }
    return { ok: true, route: connector };
  } catch {
    if (options?.signal?.aborted) {
      return {
        ok: false,
        error: {
          code: "STALE_RECALCULATE",
          message: "Ce raccordement n’est plus d’actualité.",
          suggestions: ["Le trajet GPX affiché n’a pas été modifié."],
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "PROVIDER_ERROR",
        message:
          "Le raccordement vers le trajet GPX a échoué. Le tracé importé reste affiché.",
        suggestions: [
          "Continuez vers le point d’entrée affiché.",
          "Réessayez dans quelques instants.",
        ],
      },
    };
  }
}
