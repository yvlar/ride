import { lineStringLengthKm } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  mergeRecalculatedRoute,
  pointAlongLine,
  remainingGeometryFromProgress,
  remainingStepsFromProgress,
  replaceDestinationRoute,
  selectRejoinDistanceKm,
} from "@/domain/navigation/merge";
import type { NavigationStep } from "@/domain/navigation/types";
import {
  parseDestinationRideRequest,
  parseLoopRideRequest,
  parseRoundTripRideRequest,
  recalculateRideEnvelopeSchema,
} from "@/domain/ride/schemas";
import type {
  GenerateRideRequest,
  GeneratedRideRoute,
  RideGenerationError,
  RideStyle,
  RoutePreferences,
  RouteSegment,
} from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import type {
  RoutingProvider,
  RoutingProviderOptions,
} from "@/infrastructure/routing/routing-provider";
import {
  knowledgeUnavailableError,
  applyHardRoutePreferences,
} from "./routing-failure";
import { isRoutingKnowledgeError } from "@/infrastructure/routing/routing-knowledge-error";

export type RecalculateRideResult =
  | { ok: true; route: GeneratedRideRoute }
  | { ok: false; error: RideGenerationError };

export type RecalculateRideOptions = RoutingProviderOptions & {
  generation?: number;
  isCurrent?: (generation: number) => boolean;
};

export async function recalculateRoute(
  input: unknown,
  routingProvider?: RoutingProvider,
  options?: RecalculateRideOptions,
): Promise<RecalculateRideResult> {
  if (
    options?.generation !== undefined &&
    options.isCurrent &&
    !options.isCurrent(options.generation)
  ) {
    return staleResult();
  }

  let provider = routingProvider;
  if (!provider) {
    try {
      provider = createRoutingProvider();
    } catch {
      return providerUnavailable();
    }
  }

  const parsed = recalculateRideEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map((issue) => issue.message).join(" "),
        suggestions: [
          "Renvoyez le trajet courant en mémoire et la position actuelle uniquement pour un recalcul.",
        ],
      },
    };
  }

  const request = parseRecalculateRequest(parsed.data.request);
  if (!request.ok) {
    return request;
  }

  const original = parsed.data.originalRoute as GeneratedRideRoute;
  const preferences: RoutePreferences = request.value.preferences ?? {
    avoidHighways: false,
    avoidUnpaved: false,
  };
  const style: RideStyle | undefined = request.value.style;
  const remainingGeometry = remainingGeometryFromProgress(
    original.geometry,
    parsed.data.progressKm,
  );
  const remainingSteps = remainingStepsFromProgress(
    original.steps ?? [],
    parsed.data.progressKm,
  );
  const remainingDistanceKm = lineStringLengthKm(remainingGeometry);
  const remainingDurationMinutes =
    original.distanceKm > 0
      ? original.durationMinutes * (remainingDistanceKm / original.distanceKm)
      : 0;
  const remainingSegments = remainingRouteSegments(
    original.segments,
    original.distanceKm,
    parsed.data.progressKm,
  );

  const target = selectRecalculateTarget(
    request.value,
    remainingGeometry,
    remainingDistanceKm,
  );
  if (!target) {
    return {
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: "Impossible de trouver un point de raccord sur le trajet restant.",
        suggestions: ["Continuez sur le trajet affiché ou réessayez."],
      },
    };
  }

  try {
    const connector = applyHardRoutePreferences(
      await provider.calculateRoute(
        {
          start: parsed.data.currentPosition,
          destination: target,
          style,
          preferences,
        },
        { signal: options?.signal },
      ),
      preferences,
    );

    if (
      options?.generation !== undefined &&
      options.isCurrent &&
      !options.isCurrent(options.generation)
    ) {
      return staleResult();
    }

    if (options?.signal?.aborted) {
      return staleResult();
    }

    // Destination: GPS → final destination through RoutingProvider with the
    // same style/preferences (FR-026, BR-008). This is not a new scenic
    // generation: the rider needs a return to the planned end, not a new ride.
    const remainingAfterJoin =
      request.value.type === "destination"
        ? { geometry: { type: "LineString" as const, coordinates: [] }, steps: [] as NavigationStep[], segments: [] as RouteSegment[], distanceKm: 0, durationMinutes: 0 }
        : splitRemainingAfterJoin(remainingGeometry, remainingSteps, remainingSegments, remainingDistanceKm, remainingDurationMinutes);

    const route =
      request.value.type === "destination"
        ? replaceDestinationRoute({
            original,
            geometry: connector.geometry,
            segments: connector.segments,
            steps: connector.steps ?? [],
            distanceKm: connector.distanceKm,
            durationMinutes: connector.durationMinutes,
            avoidHighways: preferences.avoidHighways,
          })
        : mergeRecalculatedRoute({
            original,
            connectorGeometry: connector.geometry,
            connectorSegments: connector.segments,
            connectorSteps: connector.steps ?? [],
            connectorDistanceKm: connector.distanceKm,
            connectorDurationMinutes: connector.durationMinutes,
            remainingGeometry: remainingAfterJoin.geometry,
            remainingSegments: remainingAfterJoin.segments,
            remainingSteps: remainingAfterJoin.steps,
            remainingDistanceKm: remainingAfterJoin.distanceKm,
            remainingDurationMinutes: remainingAfterJoin.durationMinutes,
            avoidHighways: preferences.avoidHighways,
          });

    return { ok: true, route };
  } catch (error) {
    if (options?.signal?.aborted) {
      return staleResult();
    }
    if (isRoutingKnowledgeError(error)) {
      return { ok: false, error: knowledgeUnavailableError(error) };
    }
    return {
      ok: false,
      error: {
        code: "PROVIDER_ERROR",
        message:
          "Le recalcul du trajet a échoué. L’itinéraire actuel reste affiché.",
        suggestions: [
          "Continuez sur le trajet affiché.",
          "Réessayez le recalcul dans quelques instants.",
        ],
      },
    };
  }
}

function parseRecalculateRequest(
  input: unknown,
):
  | { ok: true; value: GenerateRideRequest }
  | { ok: false; error: RideGenerationError } {
  if (typeof input !== "object" || input === null || !("type" in input)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "La demande de recalcul est invalide.",
        suggestions: ["Conservez le type, le style et les préférences d’origine."],
      },
    };
  }

  try {
    const type = (input as { type: unknown }).type;
    if (type === "loop") {
      return { ok: true, value: parseLoopRideRequest(input) };
    }
    if (type === "destination") {
      return { ok: true, value: parseDestinationRideRequest(input) };
    }
    if (type === "round_trip") {
      return { ok: true, value: parseRoundTripRideRequest(input) };
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: error instanceof Error ? error.message : "Demande invalide.",
        suggestions: ["Conservez le type, le style et les préférences d’origine."],
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "UNSUPPORTED_RIDE_TYPE",
      message: "Type de trajet non pris en charge pour le recalcul.",
      suggestions: ['Utilisez "loop", "destination" ou "round_trip".'],
    },
  };
}

function selectRecalculateTarget(
  request: GenerateRideRequest,
  remainingGeometry: LineString,
  remainingDistanceKm: number,
): Coordinates | null {
  if (request.type === "destination") {
    return request.destination.coordinates;
  }

  const aheadKm = selectRejoinDistanceKm(remainingDistanceKm);
  return pointAlongLine(remainingGeometry, aheadKm);
}

function splitRemainingAfterJoin(
  remainingGeometry: LineString,
  remainingSteps: NavigationStep[],
  remainingSegments: RouteSegment[],
  remainingDistanceKm: number,
  remainingDurationMinutes: number,
): {
  geometry: LineString;
  steps: NavigationStep[];
  segments: RouteSegment[];
  distanceKm: number;
  durationMinutes: number;
} {
  const joinKm = selectRejoinDistanceKm(remainingDistanceKm);
  const after = remainingGeometryFromProgress(remainingGeometry, joinKm);
  const leftover =
    after.coordinates.length >= 2
      ? after
      : { type: "LineString" as const, coordinates: [] };
  const afterDistance = lineStringLengthKm(leftover);
  return {
    geometry: leftover,
    steps:
      leftover.coordinates.length >= 2
        ? remainingStepsFromProgress(remainingSteps, joinKm)
        : [],
    segments: remainingRouteSegments(remainingSegments, remainingDistanceKm, joinKm),
    distanceKm: afterDistance,
    durationMinutes:
      remainingDistanceKm > 0
        ? remainingDurationMinutes * (afterDistance / remainingDistanceKm)
        : 0,
  };
}

function remainingRouteSegments(
  segments: RouteSegment[],
  totalDistanceKm: number,
  progressKm: number,
): RouteSegment[] {
  if (segments.length === 0 || totalDistanceKm <= 0) {
    return [];
  }
  let acc = 0;
  const remaining: RouteSegment[] = [];
  for (const segment of segments) {
    const start = acc;
    acc += segment.distanceKm;
    if (acc > progressKm) {
      remaining.push(
        start < progressKm
          ? {
              ...segment,
              distanceKm: acc - progressKm,
            }
          : segment,
      );
    }
  }
  return remaining;
}

function staleResult(): RecalculateRideResult {
  return {
    ok: false,
    error: {
      code: "STALE_RECALCULATE",
      message: "Ce recalcul n’est plus d’actualité.",
      suggestions: ["Le trajet affiché n’a pas été modifié."],
    },
  };
}

function providerUnavailable(): RecalculateRideResult {
  return {
    ok: false,
    error: {
      code: "PROVIDER_ERROR",
      message:
        "Le recalcul du trajet a échoué. L’itinéraire actuel reste affiché.",
      suggestions: ["Continuez sur le trajet affiché ou réessayez."],
    },
  };
}
