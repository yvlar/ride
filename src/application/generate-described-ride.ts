import { createAiRidePlanner } from "@/infrastructure/ai/create-ai-ride-planner";
import type {
  AiRidePlanner,
  DescribedPlanningFailure,
} from "@/infrastructure/ai/ai-ride-planner";
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
import {
  excludeUnitedStatesCrossing,
  routeEntersUnitedStates,
} from "@/domain/ride/canada";
import { previousRideSignature } from "@/domain/ride/route-signature";
import { distanceToleranceExplanationKm, distanceToleranceGapKm, usesKnownUnpaved } from "@/domain/ride/constraints";
import {
  DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
  isDescribeDistanceKm,
} from "@/domain/ride/describe-distance";
import {
  evaluateDestinationCandidate,
  selectBestDestinationCandidate,
  type EvaluatedDestinationCandidate,
} from "@/domain/ride/destination";
import { withHighwayAvoidanceSignal } from "@/domain/ride/highways";
import {
  evaluateLoopCandidate,
  selectBestLoopCandidate,
  type EvaluatedLoopCandidate,
} from "@/domain/ride/loop";
import {
  excludeSimilarToPrevious,
  lostOnlyToPreviousCorridor,
  regenerationOverlapError,
} from "@/domain/ride/regeneration";
import { withUnknownSurfaceSignal, excludeKnownUnpaved } from "@/domain/ride/surfaces";
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

const DESCRIBED_PLAN_ATTEMPTS = 3;
const VIA_FILTER_MODES = ["strict", "wide", "planned"] as const;

export type ViaFilterMode = (typeof VIA_FILTER_MODES)[number];

export type GenerateDescribedRideDeps = {
  webSearch?: WebSearchProvider;
  planner?: AiRidePlanner;
};

export type GenerateDescribedRideResult =
  | { ok: true; route: GeneratedLoopRoute | GeneratedDestinationRoute }
  | { ok: false; error: RideGenerationError };

type DescribedRouteAttempt = {
  acceptOutOfTolerance?: boolean;
};

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
  const minViaCount = returnToStart ? 2 : 1;
  const planInput = {
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
  };

  let previousPlanningFailure: DescribedPlanningFailure | undefined;
  let lastFailure: GenerateDescribedRideResult | undefined;

  for (let attempt = 0; attempt < DESCRIBED_PLAN_ATTEMPTS; attempt += 1) {
    const lastAttempt = attempt === DESCRIBED_PLAN_ATTEMPTS - 1;
    const mode = VIA_FILTER_MODES[attempt] ?? "planned";
    let plan;
    try {
      plan = await planner.planLoop({
        ...planInput,
        previousPlanningFailure,
      });
    } catch (error) {
      lastFailure = { ok: false, error: describedAiError(error) };
      previousPlanningFailure = { reason: "unusable_via_points" };
      continue;
    }

    const viaPoints = filterViaPoints(
      request.start.coordinates,
      request.targetDistanceKm,
      plan.viaPoints,
      { returnToStart, mode },
    );
    if (viaPoints.length < minViaCount) {
      lastFailure = { ok: false, error: noValidDescribedRideError() };
      previousPlanningFailure = { reason: "unusable_via_points" };
      continue;
    }

    const routed = returnToStart
      ? await routeDescribedLoop(request, provider, viaPoints, options, {
          acceptOutOfTolerance: lastAttempt,
        })
      : await routeDescribedOneWay(request, provider, viaPoints, options, {
          acceptOutOfTolerance: lastAttempt,
        });
    if (routed.ok) {
      return routed;
    }

    lastFailure = routed;
    const retry = describedPlanningRetry(routed.error);
    if (!retry || lastAttempt) {
      return routed;
    }
    previousPlanningFailure = retry;
  }

  return lastFailure ?? { ok: false, error: noValidDescribedRideError() };
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
  attempt?: DescribedRouteAttempt,
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
  const acceptOutOfTolerance = attempt?.acceptOutOfTolerance === true;
  const knowledge = primaryKnowledgeError(settled);

  if (
    lostOnlyToPreviousCorridor(
      options?.previousGeometry,
      describedSelectionStatus(selection.status, acceptOutOfTolerance),
      describedSelectionStatus(
        selectBestLoopCandidate(
          evaluations,
          targetDistanceKm,
          request.style,
          request.preferences?.avoidHighways === true,
          request.preferences?.avoidUnpaved === true,
          request.preferences?.stayInCanada === true,
        ).status,
        acceptOutOfTolerance,
      ),
    )
  ) {
    return { ok: false, error: regenerationOverlapError() };
  }

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
    return { ok: false, error: noValidDescribedRideError() };
  }
  if (selection.status === "distance_out_of_tolerance") {
    if (acceptOutOfTolerance) {
      return {
        ok: true,
        route: describedLoopRoute(
          request,
          targetDistanceKm,
          selection.evaluation,
          request.preferences?.avoidHighways === true,
        ),
      };
    }
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

  return {
    ok: true,
    route: describedLoopRoute(
      request,
      targetDistanceKm,
      selection.evaluation,
      request.preferences?.avoidHighways === true,
    ),
  };
}

async function routeDescribedOneWay(
  request: DescribedRoutingRequest,
  routingProvider: RoutingProvider,
  viaPoints: Coordinates[],
  options?: RideGenerationOptions,
  attempt?: DescribedRouteAttempt,
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
    return { ok: false, error: noValidDescribedRideError() };
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
  const acceptOutOfTolerance = attempt?.acceptOutOfTolerance === true;
  const knowledge = primaryKnowledgeError(settled);

  if (
    lostOnlyToPreviousCorridor(
      options?.previousGeometry,
      describedSelectionStatus(selection.status, acceptOutOfTolerance),
      describedSelectionStatus(
        selectBestDestinationCandidate(
          evaluations,
          style,
          targetDistanceKm,
          request.preferences?.avoidHighways === true,
          request.preferences?.avoidUnpaved === true,
          request.preferences?.stayInCanada === true,
        ).status,
        acceptOutOfTolerance,
      ),
    )
  ) {
    return { ok: false, error: regenerationOverlapError() };
  }

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
    if (acceptOutOfTolerance) {
      const fallback = fallbackDescribedDestination(
        selectable,
        targetDistanceKm,
        request.preferences?.avoidUnpaved === true,
        request.preferences?.stayInCanada === true,
      );
      if (fallback.status === "selected") {
        return {
          ok: true,
          route: describedOneWayRoute(
            request,
            style,
            targetDistanceKm,
            destination,
            fallback.evaluation,
            request.preferences?.avoidHighways === true,
          ),
        };
      }
      if (fallback.status === "known_unpaved_rejected") {
        return {
          ok: false,
          error: knowledgeUnavailableError(unpavedKnowledgeError()),
        };
      }
      if (fallback.status === "canada_only_rejected") {
        return {
          ok: false,
          error: knowledgeUnavailableError(canadaOnlyKnowledgeError()),
        };
      }
    }
    return { ok: false, error: noValidDescribedRideError() };
  }
  if (selection.status === "distance_out_of_tolerance") {
    if (acceptOutOfTolerance) {
      return {
        ok: true,
        route: describedOneWayRoute(
          request,
          style,
          targetDistanceKm,
          destination,
          selection.evaluation,
          request.preferences?.avoidHighways === true,
        ),
      };
    }
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

  return {
    ok: true,
    route: describedOneWayRoute(
      request,
      style,
      targetDistanceKm,
      destination,
      selection.evaluation,
      request.preferences?.avoidHighways === true,
    ),
  };
}

export function filterViaPoints(
  origin: Coordinates,
  targetDistanceKm: number,
  points: Coordinates[],
  options: { returnToStart?: boolean; mode?: ViaFilterMode } = {},
): Coordinates[] {
  const returnToStart = options.returnToStart !== false;
  const { minRadiusKm, maxRadiusKm } = viaRadiusKm(
    targetDistanceKm,
    returnToStart,
    options.mode ?? "strict",
  );

  if (!returnToStart) {
    const arrival = points[points.length - 1];
    if (
      !arrival ||
      !isUsableViaPoint(origin, arrival, minRadiusKm, maxRadiusKm)
    ) {
      return [];
    }
    const inbound = points
      .slice(0, -1)
      .filter((point) =>
        isUsableViaPoint(origin, point, minRadiusKm, maxRadiusKm),
      );
    return [...inbound, arrival];
  }

  return points.filter((point) =>
    isUsableViaPoint(origin, point, minRadiusKm, maxRadiusKm),
  );
}

function viaRadiusKm(
  targetDistanceKm: number,
  returnToStart: boolean,
  mode: ViaFilterMode,
): { minRadiusKm: number; maxRadiusKm: number } {
  if (mode === "planned") {
    return {
      minRadiusKm: 0.2,
      maxRadiusKm: Number.POSITIVE_INFINITY,
    };
  }
  if (mode === "wide") {
    return {
      minRadiusKm: Math.max(0.5, targetDistanceKm * 0.02),
      maxRadiusKm: returnToStart
        ? targetDistanceKm * 0.75
        : targetDistanceKm * 1.5,
    };
  }
  return {
    minRadiusKm: Math.max(1, targetDistanceKm * 0.04),
    maxRadiusKm: returnToStart
      ? targetDistanceKm * 0.55
      : targetDistanceKm * 1.1,
  };
}

function isUsableViaPoint(
  origin: Coordinates,
  point: Coordinates,
  minRadiusKm: number,
  maxRadiusKm: number,
): boolean {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return false;
  }
  const distanceKm = haversineKm(origin, point);
  return distanceKm >= minRadiusKm && distanceKm <= maxRadiusKm;
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

function noValidDescribedRideError(): RideGenerationError {
  return {
    code: "NO_ROUTE_FOUND",
    message: NO_VALID_DESCRIBED_RIDE_MESSAGE,
    suggestions: ["Réessayez.", "Modifiez la distance demandée."],
  };
}

function describedSelectionStatus(
  status: string,
  acceptOutOfTolerance: boolean,
): string {
  if (acceptOutOfTolerance && status === "distance_out_of_tolerance") {
    return "selected";
  }
  return status;
}

function describedPlanningRetry(
  error: RideGenerationError,
): DescribedPlanningFailure | undefined {
  if (error.code === "DISTANCE_OUT_OF_TOLERANCE") {
    return {
      reason: "distance_out_of_tolerance",
      lastDistanceKm: error.bestCandidate?.distanceKm,
    };
  }
  if (error.code === "GEOMETRIC_LOOP_REJECTED") {
    return { reason: "geometric_loop_rejected" };
  }
  if (error.code === "ROUTING_UNAVAILABLE" || error.code === "PROVIDER_ERROR") {
    return { reason: "routing_failed" };
  }
  if (error.code !== "NO_ROUTE_FOUND") {
    return undefined;
  }
  if (error.message === regenerationOverlapError().message) {
    return { reason: "regeneration_overlap" };
  }
  if (error.message === unpavedKnowledgeError().message) {
    return { reason: "known_unpaved_rejected" };
  }
  if (error.message === canadaOnlyKnowledgeError().message) {
    return { reason: "canada_only_rejected" };
  }
  return { reason: "no_route_found" };
}

function fallbackDescribedDestination(
  evaluations: EvaluatedDestinationCandidate[],
  targetDistanceKm: number,
  avoidUnpaved: boolean,
  stayInCanada: boolean,
):
  | { status: "selected"; evaluation: EvaluatedDestinationCandidate }
  | { status: "known_unpaved_rejected" }
  | { status: "canada_only_rejected" }
  | { status: "no_route_found" } {
  const network = evaluations.filter(
    (evaluation) => evaluation.followsRoadNetwork && evaluation.startsAtStart,
  );
  if (network.length === 0) {
    return { status: "no_route_found" };
  }
  const withoutUnpaved = excludeKnownUnpaved(
    network,
    (evaluation) => usesKnownUnpaved(evaluation.candidate.segments),
    avoidUnpaved,
  );
  if (avoidUnpaved && withoutUnpaved.length === 0) {
    return { status: "known_unpaved_rejected" };
  }
  const withoutUnitedStates = excludeUnitedStatesCrossing(
    withoutUnpaved,
    (evaluation) => routeEntersUnitedStates(evaluation.candidate),
    stayInCanada,
  );
  if (stayInCanada && withoutUnitedStates.length === 0) {
    return { status: "canada_only_rejected" };
  }
  const ranked = [...withoutUnitedStates].sort((left, right) => {
    if (left.reachesDestination !== right.reachesDestination) {
      return left.reachesDestination ? -1 : 1;
    }
    return (
      distanceToleranceGapKm(left.candidate.distanceKm, targetDistanceKm) -
      distanceToleranceGapKm(right.candidate.distanceKm, targetDistanceKm)
    );
  });
  const best = ranked[0];
  if (!best) {
    return { status: "no_route_found" };
  }
  return { status: "selected", evaluation: best };
}

function withDescribedDistanceWarning(
  warnings: string[],
  distanceKm: number,
  targetDistanceKm: number,
): string[] {
  const explanation = distanceToleranceExplanationKm(
    distanceKm,
    targetDistanceKm,
  );
  if (!explanation || warnings.includes(explanation)) {
    return warnings;
  }
  return [...warnings, explanation];
}

function describedLoopRoute(
  request: DescribedRoutingRequest,
  targetDistanceKm: number,
  evaluation: EvaluatedLoopCandidate,
  avoidHighways: boolean,
): GeneratedLoopRoute {
  const finalized = withUnknownSurfaceSignal(
    withHighwayAvoidanceSignal(evaluation, avoidHighways),
  );
  return {
    id: crypto.randomUUID(),
    type: "loop",
    start: request.start,
    targetDistanceKm,
    style: request.style,
    geometry: finalized.candidate.geometry,
    segments: finalized.candidate.segments,
    steps: finalized.candidate.steps ?? [],
    distanceKm: finalized.candidate.distanceKm,
    durationMinutes: finalized.candidate.durationMinutes,
    statistics: {
      repeatedRoadPercent: finalized.repeatedRoadPercent,
    },
    warnings: withDescribedDistanceWarning(
      finalized.warnings,
      finalized.candidate.distanceKm,
      targetDistanceKm,
    ),
  };
}

function describedOneWayRoute(
  request: DescribedRoutingRequest,
  style: RideStyle,
  targetDistanceKm: number,
  plannedArrival: Coordinates,
  evaluation: EvaluatedDestinationCandidate,
  avoidHighways: boolean,
): GeneratedDestinationRoute {
  const finalized = withUnknownSurfaceSignal(
    withHighwayAvoidanceSignal(evaluation, avoidHighways),
  );
  const arrival =
    lastCoordinates(finalized.candidate.geometry) ?? plannedArrival;
  return {
    id: crypto.randomUUID(),
    type: "destination",
    start: request.start,
    destination: {
      label: DESCRIBE_ARRIVAL_LABEL,
      coordinates: arrival,
    },
    style,
    targetDistanceKm,
    geometry: finalized.candidate.geometry,
    segments: finalized.candidate.segments,
    steps: finalized.candidate.steps ?? [],
    distanceKm: finalized.candidate.distanceKm,
    durationMinutes: finalized.candidate.durationMinutes,
    warnings: withDescribedDistanceWarning(
      finalized.warnings,
      finalized.candidate.distanceKm,
      targetDistanceKm,
    ),
  };
}
