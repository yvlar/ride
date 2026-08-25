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
import { lastCoordinates } from "@/domain/geo/geometry";
import type { Coordinates } from "@/domain/geo/types";
import { DESCRIBE_ARRIVAL_LABEL } from "@/application/compose-described-ride";
import { previousRideSignature } from "@/domain/ride/route-signature";
import {
  DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
  isDescribeDistanceKm,
} from "@/domain/ride/describe-distance";
import {
  evaluateDestinationCandidate,
  selectBestDestinationCandidate,
} from "@/domain/ride/destination";
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
  describedOneWayRideRequestSchema,
  loopRideRequestSchema,
  unsupportedRideTypeMessage,
} from "@/domain/ride/schemas";
import type {
  DestinationCandidate,
  GeneratedDestinationRoute,
  GeneratedLoopRoute,
  LoopCandidate,
  RideGenerationError,
  RideGenerationOptions,
  RideStyle,
  RoutePreferences,
} from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import { unpavedKnowledgeError, canadaOnlyKnowledgeError } from "@/infrastructure/routing/routing-knowledge-error";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";
import {
  readOriginAccuracyMeters,
  readPreviousRouteSignature,
  readReturnToStart,
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
  | { ok: true; route: GeneratedLoopRoute | GeneratedDestinationRoute }
  | { ok: false; error: RideGenerationError };

type DescribedRoutingRequest = {
  type: "loop" | "destination";
  start: {
    label: string;
    coordinates: Coordinates;
  };
  targetDistanceKm?: number;
  style?: RideStyle;
  preferences?: RoutePreferences;
};

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
  const parsed = parseDescribedRideRequest(input, type);
  if (!parsed.ok) {
    return parsed;
  }
  const request = parsed.request;
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

  const returnToStart =
    request.type === "destination" ? false : readReturnToStart(input);

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
      returnToStart,
    });
  } catch (error) {
    return { ok: false, error: describedAiError(error) };
  }

  const viaPoints = filterViaPoints(
    request.start.coordinates,
    request.targetDistanceKm,
    plan.viaPoints,
    { returnToStart },
  );
  if (viaPoints.length < (returnToStart ? 2 : 1)) {
    return {
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: NO_VALID_DESCRIBED_RIDE_MESSAGE,
        suggestions: ["Réessayez.", "Modifiez la distance demandée."],
      },
    };
  }

  if (!returnToStart) {
    return routeDescribedOneWay(request, provider, viaPoints, options);
  }
  return routeDescribedLoop(request, provider, viaPoints, options);
}

function parseDescribedRideRequest(
  input: unknown,
  type: unknown,
):
  | { ok: true; request: DescribedRoutingRequest }
  | { ok: false; error: RideGenerationError } {
  if (type !== "loop" && type !== "destination") {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_RIDE_TYPE",
        message: unsupportedRideTypeMessage(type),
        suggestions: [
          'Utilisez type: "loop" ou type: "destination" avec une distance cible.',
        ],
      },
    };
  }

  if (type === "destination") {
    const parsed = describedOneWayRideRequestSchema.safeParse(input);
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
    return {
      ok: true,
      request: {
        type: "destination",
        start: parsed.data.start,
        targetDistanceKm: parsed.data.targetDistanceKm,
        style: parsed.data.style,
        preferences: parsed.data.preferences ?? {
          avoidHighways: false,
          avoidUnpaved: false,
        },
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
  return { ok: true, request: parsed.data };
}

async function routeDescribedLoop(
  request: DescribedRoutingRequest,
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

async function routeDescribedOneWay(
  request: DescribedRoutingRequest,
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

  const destination = viaPoints[viaPoints.length - 1];
  if (!destination) {
    return {
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: NO_VALID_DESCRIBED_RIDE_MESSAGE,
        suggestions: ["Réessayez.", "Modifiez la distance demandée."],
      },
    };
  }
  const inbound = viaPoints.slice(0, -1);
  const waypointSets = [inbound, [...inbound].reverse()];
  const style = request.style ?? "scenic";
  const settled = await Promise.allSettled(
    waypointSets.map(async (waypoints) => {
      const result = applyHardRoutePreferences(
        await routingProvider.calculateRoute({
          start: request.start.coordinates,
          destination,
          waypoints,
          style,
          preferences: request.preferences,
        }),
        request.preferences,
      );
      const candidate: DestinationCandidate = {
        geometry: result.geometry,
        segments: result.segments,
        steps: result.steps ?? [],
        distanceKm: result.distanceKm,
        durationMinutes: result.durationMinutes,
        waypoints,
      };
      return evaluateDestinationCandidate(
        request.start.coordinates,
        destination,
        candidate,
        {
          targetDistanceKm,
          shortestDistanceKm: result.distanceKm,
        },
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

  const selection = selectBestDestinationCandidate(
    selectable,
    style,
    targetDistanceKm,
    request.preferences?.avoidHighways === true,
    request.preferences?.avoidUnpaved === true,
    request.preferences?.stayInCanada === true,
  );
  if (
    lostOnlyToPreviousCorridor(
      options?.previousGeometry,
      selection.status,
      selectBestDestinationCandidate(
        evaluations,
        style,
        targetDistanceKm,
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
          },
        },
        knowledge,
      ),
    };
  }

  const evaluation = selection.evaluation;
  const arrival =
    lastCoordinates(evaluation.candidate.geometry) ?? destination;
  const route: GeneratedDestinationRoute = {
    id: crypto.randomUUID(),
    type: "destination",
    start: request.start,
    destination: {
      label: DESCRIBE_ARRIVAL_LABEL,
      coordinates: arrival,
    },
    style,
    targetDistanceKm,
    geometry: evaluation.candidate.geometry,
    segments: evaluation.candidate.segments,
    steps: evaluation.candidate.steps ?? [],
    distanceKm: evaluation.candidate.distanceKm,
    durationMinutes: evaluation.candidate.durationMinutes,
    warnings: evaluation.warnings,
  };
  return { ok: true, route };
}

export function filterViaPoints(
  origin: Coordinates,
  targetDistanceKm: number,
  points: Coordinates[],
  options: { returnToStart?: boolean } = {},
): Coordinates[] {
  const returnToStart = options.returnToStart !== false;
  const maxRadiusKm = returnToStart
    ? targetDistanceKm * 0.55
    : targetDistanceKm * 1.1;
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
