import type { Coordinates } from "@/domain/geo/types";
import type { RideStyle, RoutePreferences } from "@/domain/ride/types";
import { resolveRoutingProvider } from "@/application/resolve-routing-provider";
import type {
  ProviderRouteResult,
  RoutingProvider,
  RoutingProviderOptions,
} from "@/infrastructure/routing/routing-provider";
import { applyHardRoutePreferences } from "./routing-failure";
import type { RideGenerationError } from "@/domain/ride/types";

export const MAX_GPX_ROUTE_WAYPOINTS = 200;

export type SnapGpxWaypointsInput = {
  waypoints: Coordinates[];
  style?: RideStyle;
  preferences?: RoutePreferences;
};

export type SnapGpxWaypointsResult =
  | { ok: true; route: ProviderRouteResult }
  | { ok: false; error: RideGenerationError };

/**
 * FR-039 — snap an ordered GPX <rte> through RoutingProvider without
 * reordering the rtept list.
 */
export async function snapGpxWaypoints(
  input: SnapGpxWaypointsInput,
  routingProvider?: RoutingProvider,
  options?: RoutingProviderOptions,
): Promise<SnapGpxWaypointsResult> {
  const waypoints = input.waypoints;
  if (waypoints.length < 2) {
    return {
      ok: false,
      error: {
        code: "GPX_INVALID",
        message: "La route GPX doit contenir au moins deux points, dans l’ordre.",
        suggestions: ["Choisissez une autre piste ou un autre fichier."],
      },
    };
  }
  if (waypoints.length > MAX_GPX_ROUTE_WAYPOINTS) {
    return {
      ok: false,
      error: {
        code: "GPX_INVALID",
        message: "Cette route GPX contient trop de points de passage.",
        suggestions: ["Simplifiez le fichier ou importez une trace <trk>."],
      },
    };
  }

  const start = waypoints[0]!;
  const destination = waypoints[waypoints.length - 1]!;
  const via = waypoints.slice(1, -1);
  const preferences: RoutePreferences = input.preferences ?? {
    avoidHighways: false,
    avoidUnpaved: false,
  };

  let provider: RoutingProvider;
  try {
    provider = resolveRoutingProvider(
      {
        type: "destination",
        start: { label: "Départ GPX", coordinates: start },
        destination: { label: "Arrivée GPX", coordinates: destination },
        style: input.style ?? "touring",
        preferences,
      },
      routingProvider,
    );
  } catch {
    return {
      ok: false,
      error: {
        code: "ROUTING_UNAVAILABLE",
        message: "Le moteur de routage n’a pas pu relier les points de la route GPX.",
        suggestions: ["Réessayez dans quelques instants."],
      },
    };
  }

  try {
    const result = applyHardRoutePreferences(
      await provider.calculateRoute(
        {
          start,
          destination,
          waypoints: via.length > 0 ? via : undefined,
          style: input.style,
          preferences,
        },
        { signal: options?.signal },
      ),
      preferences,
    );
    return { ok: true, route: result };
  } catch {
    return {
      ok: false,
      error: {
        code: "PROVIDER_ERROR",
        message: "Le moteur de routage n’a pas pu relier les points de la route GPX.",
        suggestions: ["Réessayez ou choisissez une trace plutôt qu’une route."],
      },
    };
  }
}
