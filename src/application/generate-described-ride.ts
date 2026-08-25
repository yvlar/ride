import { createAiRidePlanner } from "@/infrastructure/ai/create-ai-ride-planner";
import type {
  AiRidePlan,
  AiRidePlanner,
  DescribedPlanningFailure,
} from "@/infrastructure/ai/ai-ride-planner";
import {
  AI_UNAVAILABLE_MESSAGE,
  AiRidePlannerError,
  isAiRidePlannerError,
} from "@/infrastructure/ai/ai-ride-planner-error";
import { createWebSearchProvider } from "@/infrastructure/search/create-web-search-provider";
import { motorcycleSearchQueries } from "@/infrastructure/search/http-web-search-provider";
import {
  isWebSearchError,
  WebSearchError,
} from "@/infrastructure/search/web-search-error";
import type {
  MotorcycleWebSearchInput,
  WebSearchHit,
  WebSearchProvider,
} from "@/infrastructure/search/web-search-provider";
import { haversineKm } from "@/domain/geo/distance";
import { lastCoordinates } from "@/domain/geo/geometry";
import type { Coordinates } from "@/domain/geo/types";
import { DESCRIBE_ARRIVAL_LABEL } from "@/application/compose-described-ride";
import {
  aiWaypointToCoordinates,
  describedCorrectionFromEvaluation,
  evaluateDescribedRoute,
  hasRequiredWebGrounding,
  isGeometricDescribedLoop,
  type AiRouteCandidate,
  type NamedSearchNote,
  type RouteCandidateEvaluation,
} from "@/domain/ride/ai-route";
import { previousRideSignature } from "@/domain/ride/route-signature";
import {
  describedLoopWaypointOrders,
  describedOneWayWaypointOrders,
} from "@/domain/ride/waypoint-order";
import {
  DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
  isDescribeDistanceKm,
} from "@/domain/ride/describe-distance";
import {
  preferAvoidingHighways,
  usesHighway,
  withHighwayAvoidanceSignal,
} from "@/domain/ride/highways";
import {
  excludeSimilarToPrevious,
  lostOnlyToPreviousCorridor,
  regenerationOverlapError,
} from "@/domain/ride/regeneration";
import { withUnknownSurfaceSignal } from "@/domain/ride/surfaces";
import {
  describedOneWayRideRequestSchema,
  loopRideRequestSchema,
  unsupportedRideTypeMessage,
} from "@/domain/ride/schemas";
import type {
  GeneratedDestinationRoute,
  GeneratedLoopRoute,
  RideGenerationError,
  RideGenerationOptions,
  RideStyle,
  RoutePreferences,
} from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import {
  canadaOnlyKnowledgeError,
  unpavedKnowledgeError,
} from "@/infrastructure/routing/routing-knowledge-error";
import type {
  ProviderRouteResult,
  RoutingProvider,
  RoutingProviderOptions,
} from "@/infrastructure/routing/routing-provider";
import {
  readOriginAccuracyMeters,
  readPreviousRouteSignature,
  readReturnToStart,
} from "./ai-web-generation";
import {
  applyHardRoutePreferences,
  errorFromExhaustedAttempts,
  knowledgeUnavailableError,
  stayInCanadaEndpointError,
} from "./routing-failure";

export const ROUTING_UNAVAILABLE_MESSAGE =
  "Le moteur de routage est indisponible.";
export const WEB_SEARCH_UNAVAILABLE_USER_MESSAGE =
  "La recherche Web est indisponible.";
export const NO_VALID_DESCRIBED_RIDE_MESSAGE =
  "Aucun trajet respectant toutes les contraintes n’a été trouvé.";
const MIN_AI_VIA_POINT_SEPARATION_KM = 0.25;
const DESCRIBED_PLAN_ROUNDS = 3;
const DESCRIBED_CANDIDATES_PER_ROUND = 4;
const DESCRIBED_REQUEST_BUDGET_MS = 55_000;
const MIN_SEARCH_ROUND_BUDGET_MS = 22_000;
const MIN_CORRECTION_ROUND_BUDGET_MS = 15_000;
const EXTRA_ORDER_BUDGET_MS = 8_000;
const MAX_ROUTING_CALL_MS = 7_000;
const CORRIDOR_HINTS = ["north-east", "south-west", "north-west"] as const;

export type ViaFilterMode = "strict" | "wide" | "planned";

export type GenerateDescribedRideDeps = {
  webSearch?: WebSearchProvider;
  planner?: AiRidePlanner;
  now?: () => number;
  deadlineMs?: number;
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

type RoutedDescribedAttempt = {
  candidate: AiRouteCandidate;
  waypoints: Coordinates[];
  routed: ProviderRouteResult;
  evaluation: RouteCandidateEvaluation;
};

/**
 * FR-034 — AI + web search must both run. The road-network adapter then
 * snaps structured via-points. Never fall back to geometric loop seeds.
 * BR-001 / BR-010 / BR-011 are hard for this flow.
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

  const returnToStart =
    request.type === "destination" ? false : readReturnToStart(input);

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

  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.deadlineMs ?? DESCRIBED_REQUEST_BUDGET_MS);
  const usedQueryKeys = new Set<string>();
  const triedRoads: string[] = [];
  let previousPlanningFailure: DescribedPlanningFailure | undefined;
  let bestAttempt: RoutedDescribedAttempt | undefined;
  let lastFailure: GenerateDescribedRideResult | undefined;
  let lastHits: WebSearchHit[] = [];

  for (let round = 0; round < DESCRIBED_PLAN_ROUNDS; round += 1) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      break;
    }
    const refreshSearch = shouldRefreshWebSearch(
      round,
      lastHits,
      previousPlanningFailure,
    );
    const minRoundBudgetMs = refreshSearch
      ? MIN_SEARCH_ROUND_BUDGET_MS
      : MIN_CORRECTION_ROUND_BUDGET_MS;
    if (round > 0 && remainingMs < minRoundBudgetMs) {
      break;
    }

    const searchInput = refinedSearchInput(
      request,
      returnToStart,
      round,
      previousPlanningFailure,
      triedRoads,
    );
    if (refreshSearch) {
      const queries = motorcycleSearchQueries(searchInput);
      const queryKey = queries.join("\n");
      if (usedQueryKeys.has(queryKey) && round > 0) {
        searchInput.searchRadiusKm = Math.round(
          (searchInput.searchRadiusKm ?? request.targetDistanceKm ?? 100) * 1.25,
        );
        searchInput.corridorHint =
          CORRIDOR_HINTS[(round + 1) % CORRIDOR_HINTS.length];
      }
      usedQueryKeys.add(motorcycleSearchQueries(searchInput).join("\n"));

      try {
        lastHits = await webSearch.searchMotorcycleRoads(searchInput);
      } catch (error) {
        return { ok: false, error: describedWebSearchError(error) };
      }
    }

    if (lastHits.length === 0) {
      previousPlanningFailure = {
        reason: "unusable_via_points",
        instruction:
          "Web search returned no named roads, villages, or points of interest. Expand the radius and search a different corridor.",
        searchRadiusKm: searchInput.searchRadiusKm,
        corridorHint: searchInput.corridorHint,
      };
      lastFailure = {
        ok: false,
        error: noValidDescribedRideError(),
      };
      continue;
    }

    let plan: AiRidePlan;
    const candidateCount =
      deadline - now() < EXTRA_ORDER_BUDGET_MS
        ? Math.min(3, DESCRIBED_CANDIDATES_PER_ROUND)
        : DESCRIBED_CANDIDATES_PER_ROUND;
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
        searchHits: lastHits,
        returnToStart,
        previousPlanningFailure,
        triedRoads,
        searchRadiusKm: searchInput.searchRadiusKm,
        corridorHint: searchInput.corridorHint,
        candidateCount,
      });
    } catch (error) {
      lastFailure = { ok: false, error: describedAiError(error) };
      previousPlanningFailure = {
        reason: "unusable_via_points",
        instruction:
          "Replace unroutable coordinates with named public-road anchors from the web results.",
      };
      continue;
    }

    const attempts = await evaluatePlanCandidates(
      request,
      provider,
      plan.candidates.slice(0, candidateCount),
      lastHits,
      returnToStart,
      { now, deadlineMs: deadline },
    );
    if (attempts.knowledgeError) {
      lastFailure = { ok: false, error: attempts.knowledgeError };
      previousPlanningFailure = planningFailureFromError(
        attempts.knowledgeError,
      );
      continue;
    }
    if (attempts.routingError && attempts.routed.length === 0) {
      if (attempts.routingError.code === "ROUTING_UNAVAILABLE") {
        return { ok: false, error: attempts.routingError };
      }
      lastFailure = { ok: false, error: attempts.routingError };
      previousPlanningFailure = {
        reason: "routing_failed",
        instruction:
          "Replace unroutable coordinates with named public-road anchors from the web results.",
      };
      continue;
    }
    if (attempts.planningFailure && attempts.routed.length === 0) {
      lastFailure = { ok: false, error: noValidDescribedRideError() };
      previousPlanningFailure = {
        ...attempts.planningFailure,
        triedRoads,
        searchRadiusKm: searchInput.searchRadiusKm,
        corridorHint: searchInput.corridorHint,
      };
      continue;
    }

    const selectable = options?.previousGeometry
      ? excludeSimilarToPrevious(
          attempts.routed,
          options.previousGeometry,
          (attempt) => attempt.routed.geometry,
        )
      : attempts.routed;
    if (
      lostOnlyToPreviousCorridor(
        options?.previousGeometry,
        selectable.some((attempt) => attempt.evaluation.valid)
          ? "selected"
          : "no_route_found",
        attempts.routed.some((attempt) => attempt.evaluation.valid)
          ? "selected"
          : "no_route_found",
      )
    ) {
      lastFailure = { ok: false, error: regenerationOverlapError() };
      previousPlanningFailure = {
        reason: "regeneration_overlap",
        instruction: "Pick a clearly different named corridor.",
      };
      continue;
    }

    const valid = selectable.filter((attempt) => attempt.evaluation.valid);
    const chosen = pickBestValid(
      valid,
      request.preferences?.avoidHighways === true,
    );
    if (chosen) {
      return {
        ok: true,
        route: returnToStart
          ? describedLoopRoute(request, request.targetDistanceKm, chosen)
          : describedOneWayRoute(request, request.targetDistanceKm, chosen),
      };
    }

    const bestThisRound = pickBestInvalid(selectable);
    if (
      bestThisRound &&
      isBetterAttempt(bestThisRound, bestAttempt)
    ) {
      bestAttempt = bestThisRound;
    }
    triedRoads.push(
      ...selectable.flatMap((attempt) => attempt.candidate.roads),
    );
    previousPlanningFailure = planningFailureFromAttempt(
      bestThisRound,
      searchInput,
      triedRoads,
    );
    lastFailure = {
      ok: false,
      error: noValidDescribedRideError(bestAttempt?.evaluation),
    };
  }

  if (lastFailure && !lastFailure.ok) {
    return {
      ok: false,
      error: withBestCandidate(lastFailure.error, bestAttempt),
    };
  }
  return {
    ok: false,
    error: noValidDescribedRideError(bestAttempt?.evaluation),
  };
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

type DescribedRouteJob = {
  candidate: AiRouteCandidate;
  candidateId: string;
  waypoints: Coordinates[];
};

type PreparedDescribedCandidate = {
  candidate: AiRouteCandidate;
  index: number;
  orders: Coordinates[][];
};

async function evaluatePlanCandidates(
  request: DescribedRoutingRequest,
  routingProvider: RoutingProvider,
  candidates: AiRouteCandidate[],
  hits: WebSearchHit[],
  returnToStart: boolean,
  budget: { now: () => number; deadlineMs: number },
): Promise<{
  routed: RoutedDescribedAttempt[];
  routingError?: RideGenerationError;
  knowledgeError?: RideGenerationError;
  planningFailure?: DescribedPlanningFailure;
}> {
  const targetDistanceKm = request.targetDistanceKm;
  if (targetDistanceKm === undefined) {
    return { routed: [] };
  }
  const notes: NamedSearchNote[] = hits.map((hit) => ({
    id: hit.id,
    title: hit.title,
    snippet: hit.snippet,
  }));
  const minViaCount = returnToStart ? 2 : 1;
  let groundedCount = 0;
  const prepared: PreparedDescribedCandidate[] = [];
  candidates.forEach((candidate, index) => {
    const grounded =
      notes.length === 0 || hasRequiredWebGrounding(candidate, notes);
    if (!grounded) {
      return;
    }
    groundedCount += 1;
    const rawPoints = candidate.viaPoints.map(aiWaypointToCoordinates);
    const viaPoints = filterViaPoints(
      request.start.coordinates,
      targetDistanceKm,
      rawPoints,
      { returnToStart },
    );
    if (viaPoints.length < minViaCount) {
      return;
    }
    const orders = returnToStart
      ? describedLoopWaypointOrders(request.start.coordinates, viaPoints)
      : oneWayOrders(request.start.coordinates, viaPoints);
    if (orders.length === 0) {
      return;
    }
    prepared.push({ candidate, index, orders });
  });

  if (prepared.length === 0) {
    return {
      routed: [],
      planningFailure: emptyPlanFailure(candidates.length, groundedCount),
    };
  }

  const jobsForOrder = (orderIndex: number): DescribedRouteJob[] =>
    prepared.flatMap((item) => {
      const waypoints = item.orders[orderIndex];
      if (!waypoints) {
        return [];
      }
      return [
        {
          candidate: item.candidate,
          candidateId: `${item.candidate.candidateName}:${item.index}:${orderIndex}`,
          waypoints,
        },
      ];
    });

  const routeJobs = (jobs: DescribedRouteJob[]) =>
    Promise.allSettled(
      jobs.map((job) =>
        routeDescribedJob(
          request,
          routingProvider,
          job,
          returnToStart,
          targetDistanceKm,
          routingCallOptions(budget.deadlineMs, budget.now),
        ),
      ),
    );

  const firstJobs = jobsForOrder(0);
  if (firstJobs.length === 0) {
    return {
      routed: [],
      planningFailure: emptyPlanFailure(candidates.length, groundedCount),
    };
  }

  const firstSettled = await routeJobs(firstJobs);
  const firstRouted = fulfilledDescribedAttempts(firstSettled);
  if (firstRouted.some((attempt) => attempt.evaluation.valid)) {
    return { routed: firstRouted };
  }

  const extraJobs = [1, 2].flatMap((orderIndex) => jobsForOrder(orderIndex));
  const remainingMs = budget.deadlineMs - budget.now();
  const canCorrect = remainingMs >= MIN_CORRECTION_ROUND_BUDGET_MS;
  const canRunExtrasAndCorrect =
    remainingMs >= EXTRA_ORDER_BUDGET_MS + MIN_CORRECTION_ROUND_BUDGET_MS;
  if (
    extraJobs.length === 0 ||
    remainingMs < EXTRA_ORDER_BUDGET_MS ||
    (canCorrect && !canRunExtrasAndCorrect)
  ) {
    return settleDescribedAttempts(firstSettled, firstRouted);
  }

  const extraSettled = await routeJobs(extraJobs);
  const settled = [...firstSettled, ...extraSettled];
  const routed = [
    ...firstRouted,
    ...fulfilledDescribedAttempts(extraSettled),
  ];
  return settleDescribedAttempts(settled, routed);
}

async function routeDescribedJob(
  request: DescribedRoutingRequest,
  routingProvider: RoutingProvider,
  job: DescribedRouteJob,
  returnToStart: boolean,
  targetDistanceKm: number,
  options: RoutingProviderOptions,
): Promise<RoutedDescribedAttempt> {
  const destination = returnToStart
    ? request.start.coordinates
    : job.waypoints[job.waypoints.length - 1];
  if (!destination) {
    throw Object.assign(new Error("unusable_via_points"), {
      name: "UnusableViaPoints",
    });
  }
  const routed = applyHardRoutePreferences(
    await routingProvider.calculateRoute(
      {
        start: request.start.coordinates,
        destination,
        waypoints: returnToStart
          ? job.waypoints
          : job.waypoints.slice(0, -1),
        style: request.style,
        preferences: request.preferences,
      },
      options,
    ),
    request.preferences,
  );
  if (
    returnToStart &&
    isGeometricDescribedLoop({
      geometry: routed.geometry,
      segments: routed.segments,
      distanceKm: routed.distanceKm,
      durationMinutes: routed.durationMinutes,
      waypoints: job.waypoints,
    })
  ) {
    throw Object.assign(new Error("geometric_loop_rejected"), {
      name: "GeometricLoopRejected",
    });
  }
  const evaluation = evaluateDescribedRoute({
    candidateId: job.candidateId,
    origin: request.start.coordinates,
    targetDistanceKm,
    geometry: routed.geometry,
    distanceKm: routed.distanceKm,
    segments: routed.segments,
    preferences: request.preferences,
    returnToStart,
  });
  return {
    candidate: job.candidate,
    waypoints: job.waypoints,
    routed,
    evaluation,
  };
}

function fulfilledDescribedAttempts(
  settled: PromiseSettledResult<RoutedDescribedAttempt>[],
): RoutedDescribedAttempt[] {
  return settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

function settleDescribedAttempts(
  settled: PromiseSettledResult<RoutedDescribedAttempt>[],
  routed: RoutedDescribedAttempt[],
): {
  routed: RoutedDescribedAttempt[];
  routingError?: RideGenerationError;
  knowledgeError?: RideGenerationError;
  planningFailure?: DescribedPlanningFailure;
} {
  if (routed.length > 0) {
    return { routed };
  }
  const knowledge = knowledgeErrorFromSettled(settled);
  if (knowledge) {
    return { routed, knowledgeError: knowledge };
  }
  if (isAllGeometricLoopRejected(settled)) {
    return {
      routed,
      planningFailure: {
        reason: "geometric_loop_rejected",
        instruction:
          "Replace the circular sketch with named public-road anchors that follow the road network.",
      },
    };
  }
  return {
    routed,
    routingError: describedRoutingExhausted(settled),
  };
}

function routingCallOptions(
  deadlineMs: number,
  now: () => number,
): RoutingProviderOptions {
  const remainingMs = deadlineMs - now();
  if (remainingMs <= 0) {
    return { signal: AbortSignal.abort() };
  }
  return {
    signal: AbortSignal.timeout(
      Math.max(1_000, Math.min(MAX_ROUTING_CALL_MS, remainingMs - 250)),
    ),
  };
}

function oneWayOrders(
  origin: Coordinates,
  viaPoints: Coordinates[],
): Coordinates[][] {
  const destination = viaPoints[viaPoints.length - 1];
  if (!destination) {
    return [];
  }
  return describedOneWayWaypointOrders(
    origin,
    destination,
    viaPoints.slice(0, -1),
  ).map((inbound) => [...inbound, destination]);
}

function shouldRefreshWebSearch(
  round: number,
  lastHits: WebSearchHit[],
  previousFailure: DescribedPlanningFailure | undefined,
): boolean {
  if (round === 0 || lastHits.length === 0 || !previousFailure) {
    return true;
  }
  return (
    previousFailure.reason === "unusable_via_points" ||
    previousFailure.reason === "insufficient_web_grounding" ||
    previousFailure.reason === "routing_failed"
  );
}

function refinedSearchInput(
  request: DescribedRoutingRequest,
  returnToStart: boolean,
  round: number,
  previousFailure: DescribedPlanningFailure | undefined,
  triedRoads: string[],
): MotorcycleWebSearchInput {
  const targetDistanceKm = request.targetDistanceKm ?? 100;
  const baseRadius = targetDistanceKm * (returnToStart ? 0.55 : 1.1);
  const radiusScale = 1 + round * 0.35;
  return {
    origin: request.start.coordinates,
    accuracyMeters: null,
    targetDistanceKm,
    style: request.style,
    preferences: request.preferences,
    returnToStart,
    searchRadiusKm: Math.round(baseRadius * radiusScale),
    corridorHint: CORRIDOR_HINTS[round % CORRIDOR_HINTS.length],
    triedRoads: triedRoads.length > 0 ? [...new Set(triedRoads)] : undefined,
    previousFailureReason: previousFailure?.reason,
    lastActualDistanceKm:
      previousFailure?.actualDistanceKm ?? previousFailure?.lastDistanceKm,
  };
}

function pickBestValid(
  attempts: RoutedDescribedAttempt[],
  avoidHighways: boolean,
): RoutedDescribedAttempt | undefined {
  const preferred = preferAvoidingHighways(
    attempts,
    (attempt) => usesHighway(attempt.routed.segments),
    avoidHighways,
  );
  return [...preferred].sort((left, right) => {
    const repeatDelta =
      left.evaluation.repeatedRoadPercent -
      right.evaluation.repeatedRoadPercent;
    if (repeatDelta !== 0) {
      return repeatDelta;
    }
    const spreadDelta =
      right.evaluation.maxDistanceFromOriginKm -
      left.evaluation.maxDistanceFromOriginKm;
    if (spreadDelta !== 0) {
      return spreadDelta;
    }
    return (
      Math.abs(left.evaluation.distanceKm - left.evaluation.targetDistanceKm) -
      Math.abs(right.evaluation.distanceKm - right.evaluation.targetDistanceKm)
    );
  })[0];
}

function pickBestInvalid(
  attempts: RoutedDescribedAttempt[],
): RoutedDescribedAttempt | undefined {
  if (attempts.length === 0) {
    return undefined;
  }
  return [...attempts].sort((left, right) => {
    const violationDelta =
      left.evaluation.violations.length - right.evaluation.violations.length;
    if (violationDelta !== 0) {
      return violationDelta;
    }
    const repeatDelta =
      left.evaluation.repeatedRoadPercent -
      right.evaluation.repeatedRoadPercent;
    if (repeatDelta !== 0) {
      return repeatDelta;
    }
    return (
      Math.abs(left.evaluation.distanceKm - left.evaluation.targetDistanceKm) -
      Math.abs(right.evaluation.distanceKm - right.evaluation.targetDistanceKm)
    );
  })[0];
}

function isBetterAttempt(
  next: RoutedDescribedAttempt,
  current: RoutedDescribedAttempt | undefined,
): boolean {
  if (!current) {
    return true;
  }
  if (
    next.evaluation.violations.length !== current.evaluation.violations.length
  ) {
    return (
      next.evaluation.violations.length < current.evaluation.violations.length
    );
  }
  if (
    next.evaluation.repeatedRoadPercent !==
    current.evaluation.repeatedRoadPercent
  ) {
    return (
      next.evaluation.repeatedRoadPercent <
      current.evaluation.repeatedRoadPercent
    );
  }
  return (
    Math.abs(next.evaluation.distanceKm - next.evaluation.targetDistanceKm) <
    Math.abs(
      current.evaluation.distanceKm - current.evaluation.targetDistanceKm,
    )
  );
}

function isAllGeometricLoopRejected(
  settled: PromiseSettledResult<unknown>[],
): boolean {
  return (
    settled.length > 0 &&
    settled.every(
      (result) =>
        result.status === "rejected" && isGeometricLoopRejection(result.reason),
    )
  );
}

function isGeometricLoopRejection(reason: unknown): boolean {
  return (
    typeof reason === "object" &&
    reason !== null &&
    (reason as { name?: unknown }).name === "GeometricLoopRejected"
  );
}

function withBestCandidate(
  error: RideGenerationError,
  attempt?: RoutedDescribedAttempt,
): RideGenerationError {
  if (error.bestCandidate || !attempt) {
    return error;
  }
  return {
    ...error,
    bestCandidate: {
      distanceKm: attempt.evaluation.distanceKm,
      repeatedRoadPercent: attempt.evaluation.repeatedRoadPercent,
      maxDistanceFromOriginKm: attempt.evaluation.maxDistanceFromOriginKm,
      violations: attempt.evaluation.violations,
    },
  };
}

function emptyPlanFailure(
  candidateCount: number,
  groundedCount: number,
): DescribedPlanningFailure {
  if (candidateCount > 0 && groundedCount === 0) {
    return {
      reason: "insufficient_web_grounding",
      instruction:
        "Ground every candidate in at least two named roads, villages, or points of interest from the web results.",
    };
  }
  return {
    reason: "unusable_via_points",
    instruction:
      "Replace unroutable coordinates with named public-road anchors from the web results.",
  };
}

function planningFailureFromError(
  error: RideGenerationError,
): DescribedPlanningFailure {
  if (error.message === unpavedKnowledgeError().message) {
    return {
      reason: "unpaved_rejected",
      instruction: "Use paved public roads only.",
    };
  }
  if (error.message === canadaOnlyKnowledgeError().message) {
    return {
      reason: "canada_only_rejected",
      instruction: "Keep the entire corridor in Canada.",
    };
  }
  return {
    reason: "no_route_found",
    instruction:
      "Propose a different named corridor that satisfies every constraint.",
  };
}

function planningFailureFromAttempt(
  attempt: RoutedDescribedAttempt | undefined,
  searchInput: MotorcycleWebSearchInput,
  triedRoads: string[],
): DescribedPlanningFailure {
  if (!attempt) {
    return {
      reason: "unusable_via_points",
      instruction:
        "Replace unroutable coordinates with named public-road anchors from the web results.",
      triedRoads,
      searchRadiusKm: searchInput.searchRadiusKm,
      corridorHint: searchInput.corridorHint,
    };
  }
  const correction = describedCorrectionFromEvaluation(attempt.evaluation);
  return {
    ...correction,
    lastDistanceKm: attempt.evaluation.distanceKm,
    triedRoads,
    searchRadiusKm: searchInput.searchRadiusKm,
    corridorHint: searchInput.corridorHint,
  };
}

export function filterViaPoints(
  origin: Coordinates,
  targetDistanceKm: number,
  points: Coordinates[],
  options: { returnToStart?: boolean; mode?: ViaFilterMode } = {},
): Coordinates[] {
  const returnToStart = options.returnToStart !== false;
  const maxRadiusKm = returnToStart
    ? targetDistanceKm * 0.75
    : targetDistanceKm * 1.1;

  if (!returnToStart) {
    const arrival = points[points.length - 1];
    if (!arrival || !isFinitePoint(arrival) || haversineKm(origin, arrival) < MIN_AI_VIA_POINT_SEPARATION_KM) {
      return [];
    }
    if (haversineKm(origin, arrival) > maxRadiusKm && options.mode !== "planned") {
      return [];
    }
    const inbound = distinctViaPoints(
      points
        .slice(0, -1)
        .filter(
          (point) =>
            isFinitePoint(point) &&
            haversineKm(origin, point) >= MIN_AI_VIA_POINT_SEPARATION_KM &&
            (options.mode === "planned" ||
              haversineKm(origin, point) <= maxRadiusKm),
        ),
    ).filter(
      (point) => haversineKm(point, arrival) >= MIN_AI_VIA_POINT_SEPARATION_KM,
    );
    return [...inbound, arrival];
  }

  return distinctViaPoints(
    points.filter(
      (point) =>
        isFinitePoint(point) &&
        haversineKm(origin, point) >= MIN_AI_VIA_POINT_SEPARATION_KM &&
        haversineKm(origin, point) <= maxRadiusKm,
    ),
  );
}

function distinctViaPoints(points: Coordinates[]): Coordinates[] {
  const distinct: Coordinates[] = [];
  for (const point of points) {
    if (
      distinct.every(
        (candidate) =>
          haversineKm(candidate, point) >= MIN_AI_VIA_POINT_SEPARATION_KM,
      )
    ) {
      distinct.push(point);
    }
  }
  return distinct;
}

function isFinitePoint(point: Coordinates): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
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

function knowledgeErrorFromSettled(
  settled: PromiseSettledResult<unknown>[],
): RideGenerationError | undefined {
  const everyAttemptFailed =
    settled.length > 0 &&
    settled.every((result) => result.status === "rejected");
  if (!everyAttemptFailed) {
    return undefined;
  }
  const messages = settled.flatMap((result) =>
    result.status === "rejected" && result.reason instanceof Error
      ? [result.reason.message]
      : [],
  );
  if (
    messages.length > 0 &&
    messages.every((message) => message === unpavedKnowledgeError().message)
  ) {
    return knowledgeUnavailableError(unpavedKnowledgeError());
  }
  if (
    messages.length > 0 &&
    messages.every((message) => message === canadaOnlyKnowledgeError().message)
  ) {
    return knowledgeUnavailableError(canadaOnlyKnowledgeError());
  }
  return undefined;
}

function noValidDescribedRideError(
  evaluation?: RouteCandidateEvaluation,
): RideGenerationError {
  return {
    code: "NO_ROUTE_FOUND",
    message: NO_VALID_DESCRIBED_RIDE_MESSAGE,
    suggestions: ["Réessayez.", "Modifiez la distance demandée."],
    bestCandidate: evaluation
      ? {
          distanceKm: evaluation.distanceKm,
          repeatedRoadPercent: evaluation.repeatedRoadPercent,
          maxDistanceFromOriginKm: evaluation.maxDistanceFromOriginKm,
          violations: evaluation.violations,
        }
      : undefined,
  };
}

function describedLoopRoute(
  request: DescribedRoutingRequest,
  targetDistanceKm: number,
  attempt: RoutedDescribedAttempt,
): GeneratedLoopRoute {
  const avoidHighways = request.preferences?.avoidHighways === true;
  const finalized = withUnknownSurfaceSignal(
    withHighwayAvoidanceSignal(
      {
        candidate: {
          geometry: attempt.routed.geometry,
          segments: attempt.routed.segments,
          steps: attempt.routed.steps ?? [],
          distanceKm: attempt.routed.distanceKm,
          durationMinutes: attempt.routed.durationMinutes,
          waypoints: attempt.waypoints,
        },
        warnings: [],
        repeatedRoadPercent: attempt.evaluation.repeatedRoadPercent,
      },
      avoidHighways,
    ),
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
    warnings: finalized.warnings,
  };
}

function describedOneWayRoute(
  request: DescribedRoutingRequest,
  targetDistanceKm: number,
  attempt: RoutedDescribedAttempt,
): GeneratedDestinationRoute {
  const style = request.style ?? "scenic";
  const avoidHighways = request.preferences?.avoidHighways === true;
  const finalized = withUnknownSurfaceSignal(
    withHighwayAvoidanceSignal(
      {
        candidate: {
          geometry: attempt.routed.geometry,
          segments: attempt.routed.segments,
          steps: attempt.routed.steps ?? [],
          distanceKm: attempt.routed.distanceKm,
          durationMinutes: attempt.routed.durationMinutes,
          waypoints: attempt.waypoints,
        },
        warnings: [],
      },
      avoidHighways,
    ),
  );
  const arrival =
    lastCoordinates(finalized.candidate.geometry) ??
    attempt.waypoints[attempt.waypoints.length - 1];
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
    warnings: finalized.warnings,
  };
}
