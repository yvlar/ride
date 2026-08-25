import { createAiRidePlanner } from "@/infrastructure/ai/create-ai-ride-planner";
import type { AiRidePlanner } from "@/infrastructure/ai/ai-ride-planner";
import {
  AI_UNAVAILABLE_MESSAGE,
  AiRidePlannerError,
  isAiRidePlannerError,
} from "@/infrastructure/ai/ai-ride-planner-error";
import { createWebSearchProvider } from "@/infrastructure/search/create-web-search-provider";
import {
  isWebSearchError,
  WebSearchError,
} from "@/infrastructure/search/web-search-error";
import type { WebSearchProvider } from "@/infrastructure/search/web-search-provider";
import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { previousRideSignature } from "@/domain/ride/route-signature";
import {
  DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
  isDescribeDistanceKm,
} from "@/domain/ride/describe-distance";
import {
  evaluateLoopCandidate,
  selectBestLoopCandidate,
} from "@/domain/ride/loop";
import {
  excludeSimilarToPrevious,
  lostOnlyToPreviousCorridor,
  regenerationOverlapError,
} from "@/domain/ride/regeneration";
import {
  loopRideRequestSchema,
  unsupportedRideTypeMessage,
} from "@/domain/ride/schemas";
import type {
  GeneratedLoopRoute,
  LoopCandidate,
  LoopRideRequest,
  RideGenerationError,
  RideGenerationOptions,
} from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import { unpavedKnowledgeError, canadaOnlyKnowledgeError } from "@/infrastructure/routing/routing-knowledge-error";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";
import {
  readOriginAccuracyMeters,
  readPreviousRouteSignature,
} from "./ai-web-generation";
import {
  applyHardRoutePreferences,
  errorFromExhaustedAttempts,
  knowledgeUnavailableError,
  primaryKnowledgeError,
  stayInCanadaEndpointError,
  withKnowledgeConstraint,
} from "./routing-failure";

export const ROUTING_UNAVAILABLE_MESSAGE =
  "Le moteur de routage est indisponible.";
export const WEB_SEARCH_UNAVAILABLE_USER_MESSAGE =
  "La recherche Web est indisponible.";
export const NO_VALID_DESCRIBED_RIDE_MESSAGE =
  "Aucun trajet valide n’a pu être trouvé.";

export type GenerateDescribedRideDeps = {
  webSearch?: WebSearchProvider;
  planner?: AiRidePlanner;
};

export type GenerateDescribedRideResult =
  | { ok: true; route: GeneratedLoopRoute }
  | { ok: false; error: RideGenerationError };

/**
 * FR-034 — AI + web search must both run. The road-network adapter then
 * snaps structured via-points. Never fall back to geometric loop seeds.
 */
export async function generateDescribedRide(
  input: unknown,
  routingProvider?: RoutingProvider,
  options?: RideGenerationOptions,
  deps: GenerateDescribedRideDeps = {},
): Promise<GenerateDescribedRideResult> {
  let provider: RoutingProvider;
  try {
    provider =
      routingProvider ??
      createRoutingProvider(undefined, { roadNetworkOnly: true });
  } catch {
    return { ok: false, error: describedRoutingError() };
  }

  const type =
    typeof input === "object" && input !== null && "type" in input
      ? (input as { type: unknown }).type
      : undefined;
  if (type !== "loop") {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_RIDE_TYPE",
        message: unsupportedRideTypeMessage(type),
        suggestions: ['Utilisez type: "loop" avec une distance cible.'],
      },
    };
  }

  const parsed = loopRideRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map((issue) => issue.message).join(" "),
        suggestions: [
          "Indiquez un point de départ et une distance entre 20 km et 500 km.",
        ],
      },
    };
  }

  const request = parsed.data;
  if (!isDescribeDistanceKm(request.targetDistanceKm)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
        suggestions: ["Choisissez une distance entre 20 km et 500 km."],
      },
    };
  }

  const endpointError = stayInCanadaEndpointError(
    request.start.coordinates,
    undefined,
    request.preferences?.stayInCanada,
  );
  if (endpointError) {
    return { ok: false, error: endpointError };
  }

  let webSearch: WebSearchProvider;
  try {
    webSearch = deps.webSearch ?? createWebSearchProvider();
  } catch (error) {
    return { ok: false, error: describedWebSearchError(error) };
  }

  let planner: AiRidePlanner;
  try {
    planner = deps.planner ?? createAiRidePlanner();
  } catch (error) {
    return { ok: false, error: describedAiError(error) };
  }

  let searchHits;
  try {
    searchHits = await webSearch.searchMotorcycleRoads({
      origin: request.start.coordinates,
      accuracyMeters: readOriginAccuracyMeters(input),
      targetDistanceKm: request.targetDistanceKm,
      style: request.style,
      preferences: request.preferences,
    });
  } catch (error) {
    return { ok: false, error: describedWebSearchError(error) };
  }

  let plan;
  try {
    plan = await planner.planLoop({
      origin: request.start.coordinates,
      accuracyMeters: readOriginAccuracyMeters(input),
      targetDistanceKm: request.targetDistanceKm,
      style: request.style,
      preferences: request.preferences,
      previousRouteSignature:
        readPreviousRouteSignature(input) ??
        (options?.previousGeometry
          ? previousRideSignature({ geometry: options.previousGeometry })
          : undefined),
      searchHits,
    });
  } catch (error) {
    return { ok: false, error: describedAiError(error) };
  }

  const viaPoints = filterViaPoints(
    request.start.coordinates,
    request.targetDistanceKm,
    plan.viaPoints,
  );
  if (viaPoints.length < 2) {
    return {
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: NO_VALID_DESCRIBED_RIDE_MESSAGE,
        suggestions: ["Réessayez.", "Modifiez la distance demandée."],
      },
    };
  }

  return routeDescribedLoop(request, provider, viaPoints, options);
}

async function routeDescribedLoop(
  request: LoopRideRequest,
  routingProvider: RoutingProvider,
  viaPoints: Coordinates[],
  options?: RideGenerationOptions,
): Promise<GenerateDescribedRideResult> {
  const targetDistanceKm = request.targetDistanceKm;
  if (targetDistanceKm === undefined) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
        suggestions: ["Choisissez une distance entre 20 km et 500 km."],
      },
    };
  }

  const waypointSets = [viaPoints, [...viaPoints].reverse()];
  const settled = await Promise.allSettled(
    waypointSets.map(async (waypoints) => {
      const result = applyHardRoutePreferences(
        await routingProvider.calculateRoute({
          start: request.start.coordinates,
          destination: request.start.coordinates,
          waypoints,
          style: request.style,
          preferences: request.preferences,
        }),
        request.preferences,
      );
      const candidate: LoopCandidate = {
        geometry: result.geometry,
        segments: result.segments,
        steps: result.steps ?? [],
        distanceKm: result.distanceKm,
        durationMinutes: result.durationMinutes,
        waypoints,
      };
      return evaluateLoopCandidate(
        request.start.coordinates,
        targetDistanceKm,
        candidate,
      );
    }),
  );

  const evaluations = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (evaluations.length === 0) {
    return {
      ok: false,
      error: describedRoutingExhausted(settled),
    };
  }

  const selectable = options?.previousGeometry
    ? excludeSimilarToPrevious(
        evaluations,
        options.previousGeometry,
        (evaluation) => evaluation.candidate.geometry,
      )
    : evaluations;

  const selection = selectBestLoopCandidate(
    selectable,
    targetDistanceKm,
    request.style,
    request.preferences?.avoidHighways === true,
    request.preferences?.avoidUnpaved === true,
    request.preferences?.stayInCanada === true,
  );
  if (
    lostOnlyToPreviousCorridor(
      options?.previousGeometry,
      selection.status,
      selectBestLoopCandidate(
        evaluations,
        targetDistanceKm,
        request.style,
        request.preferences?.avoidHighways === true,
        request.preferences?.avoidUnpaved === true,
        request.preferences?.stayInCanada === true,
      ).status,
    )
  ) {
    return { ok: false, error: regenerationOverlapError() };
  }

  const knowledge = primaryKnowledgeError(settled);

  if (selection.status === "known_unpaved_rejected") {
    return {
      ok: false,
      error: knowledgeUnavailableError(unpavedKnowledgeError()),
    };
  }
  if (selection.status === "canada_only_rejected") {
    return {
      ok: false,
      error: knowledgeUnavailableError(canadaOnlyKnowledgeError()),
    };
  }
  if (selection.status === "geometric_loop_rejected") {
    return {
      ok: false,
      error: {
        code: "GEOMETRIC_LOOP_REJECTED",
        message:
          "Le tracé obtenu est une boucle géométrique, pas un itinéraire sur le réseau routier (FR-001).",
        suggestions: ["Réessayez.", "Vérifiez le moteur de routage."],
      },
    };
  }
  if (selection.status === "no_route_found") {
    return {
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: NO_VALID_DESCRIBED_RIDE_MESSAGE,
        suggestions: ["Réessayez.", "Modifiez la distance demandée."],
      },
    };
  }
  if (selection.status === "distance_out_of_tolerance") {
    const best = selection.evaluation;
    return {
      ok: false,
      error: withKnowledgeConstraint(
        {
          code: "DISTANCE_OUT_OF_TOLERANCE",
          message: `Aucun trajet ne respecte ±10 % de ${targetDistanceKm.toFixed(0)} km (BR-001). Le meilleur candidat fait ${best.candidate.distanceKm.toFixed(1)} km.`,
          suggestions: ["Ajustez la distance cible.", "Réessayez."],
          bestCandidate: {
            distanceKm: best.candidate.distanceKm,
            repeatedRoadPercent: best.repeatedRoadPercent,
          },
        },
        knowledge,
      ),
    };
  }

  const evaluation = selection.evaluation;
  const route: GeneratedLoopRoute = {
    id: crypto.randomUUID(),
    type: "loop",
    start: request.start,
    targetDistanceKm,
    style: request.style,
    geometry: evaluation.candidate.geometry,
    segments: evaluation.candidate.segments,
    steps: evaluation.candidate.steps ?? [],
    distanceKm: evaluation.candidate.distanceKm,
    durationMinutes: evaluation.candidate.durationMinutes,
    statistics: {
      repeatedRoadPercent: evaluation.repeatedRoadPercent,
    },
    warnings: evaluation.warnings,
  };
  return { ok: true, route };
}

export function filterViaPoints(
  origin: Coordinates,
  targetDistanceKm: number,
  points: Coordinates[],
): Coordinates[] {
  const maxRadiusKm = targetDistanceKm * 0.55;
  const minRadiusKm = Math.max(1, targetDistanceKm * 0.04);
  const filtered: Coordinates[] = [];
  for (const point of points) {
    if (
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude)
    ) {
      continue;
    }
    const distanceKm = haversineKm(origin, point);
    if (distanceKm < minRadiusKm || distanceKm > maxRadiusKm) {
      continue;
    }
    filtered.push(point);
  }
  return filtered;
}

function describedWebSearchError(error: unknown): RideGenerationError {
  if (isWebSearchError(error) || error instanceof WebSearchError) {
    return {
      code: "WEB_SEARCH_UNAVAILABLE",
      message: WEB_SEARCH_UNAVAILABLE_USER_MESSAGE,
      suggestions: ["Réessayez."],
    };
  }
  return {
    code: "WEB_SEARCH_UNAVAILABLE",
    message: WEB_SEARCH_UNAVAILABLE_USER_MESSAGE,
    suggestions: ["Réessayez."],
  };
}

function describedAiError(error: unknown): RideGenerationError {
  if (isAiRidePlannerError(error) || error instanceof AiRidePlannerError) {
    return {
      code: "AI_UNAVAILABLE",
      message: AI_UNAVAILABLE_MESSAGE,
      suggestions: ["Réessayez."],
    };
  }
  return {
    code: "AI_UNAVAILABLE",
    message: AI_UNAVAILABLE_MESSAGE,
    suggestions: ["Réessayez."],
  };
}

function describedRoutingError(): RideGenerationError {
  return {
    code: "ROUTING_UNAVAILABLE",
    message: ROUTING_UNAVAILABLE_MESSAGE,
    suggestions: ["Réessayez."],
  };
}

function describedRoutingExhausted(
  settled: PromiseSettledResult<unknown>[],
): RideGenerationError {
  const exhausted = errorFromExhaustedAttempts(settled, {
    message: NO_VALID_DESCRIBED_RIDE_MESSAGE,
    suggestions: ["Réessayez."],
  });
  if (exhausted.code === "PROVIDER_ERROR") {
    return {
      code: "ROUTING_UNAVAILABLE",
      message: ROUTING_UNAVAILABLE_MESSAGE,
      suggestions: ["Réessayez."],
    };
  }
  return exhausted;
}
