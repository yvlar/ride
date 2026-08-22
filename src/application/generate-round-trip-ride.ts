import type { Coordinates } from "@/domain/geo/types";
import { resolveTargetDistanceKm } from "@/domain/ride/duration";
import {
  createDestinationWaypointSets,
  evaluateDestinationCandidate,
  isAnchoredDestination,
} from "@/domain/ride/destination";
import {
  composeRoundTripCandidate,
  createReturnWaypointSets,
  evaluateRoundTripCandidate,
  selectBestRoundTripCandidate,
} from "@/domain/ride/round-trip";
import { roundTripRideRequestSchema } from "@/domain/ride/schemas";
import type {
  DestinationCandidate,
  GeneratedRoundTripRoute,
  RideGenerationError,
  RoundTripRideRequest,
} from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import { unpavedKnowledgeError } from "@/infrastructure/routing/routing-knowledge-error";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";
import {
  errorFromExhaustedAttempts,
  knowledgeUnavailableError,
  rejectIfKnownUnpavedAvoided,
} from "./routing-failure";

export type GenerateRoundTripRideResult =
  | { ok: true; route: GeneratedRoundTripRoute }
  | { ok: false; error: RideGenerationError };

export async function generateRoundTripRide(
  input: unknown,
  routingProvider?: RoutingProvider,
): Promise<GenerateRoundTripRideResult> {
  let provider = routingProvider;
  if (!provider) {
    try {
      provider = createRoutingProvider();
    } catch {
      return {
        ok: false,
        error: {
          code: "PROVIDER_ERROR",
          message:
            "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
          suggestions: [
            "Vérifiez ROUTING_PROVIDER=ai-rag ou ROUTING_PROVIDER=mock.",
          ],
        },
      };
    }
  }

  const type =
    typeof input === "object" && input !== null && "type" in input
      ? (input as { type: unknown }).type
      : undefined;

  if (type !== "round_trip") {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_RIDE_TYPE",
        message:
          type === "loop"
            ? "Le type de trajet « loop » n’est pas pris en charge par le générateur d’aller-retour. Utilisez le générateur FR-001."
            : type === "destination"
              ? "Le type de trajet « destination » n’est pas pris en charge par le générateur d’aller-retour. Utilisez le générateur FR-002."
              : "Seuls les types « loop » (FR-001), « destination » (FR-002) et « round_trip » (FR-003) sont pris en charge.",
        suggestions: [
          'Utilisez type: "round_trip" avec un départ, une destination et un style.',
        ],
      },
    };
  }

  const parsed = roundTripRideRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: formatValidationMessage(parsed.error),
        suggestions: [
          "Indiquez un départ, une destination distincte et un style de trajet.",
        ],
      },
    };
  }

  return generateValidatedRoundTrip(
    {
      ...parsed.data,
      preferences: parsed.data.preferences ?? {
        avoidHighways: false,
        avoidUnpaved: false,
      },
    },
    provider,
  );
}

async function generateValidatedRoundTrip(
  request: RoundTripRideRequest,
  routingProvider: RoutingProvider,
): Promise<GenerateRoundTripRideResult> {
  const targetDistanceKm = resolveTargetDistanceKm(request);
  const perLegTargetKm =
    targetDistanceKm === undefined ? undefined : targetDistanceKm / 2;

  const outboundSets = createDestinationWaypointSets(
    request.start.coordinates,
    request.destination.coordinates,
    perLegTargetKm,
  );
  const inboundSets = createReturnWaypointSets(
    request.start.coordinates,
    request.destination.coordinates,
    perLegTargetKm,
  );

  const [outboundSettled, inboundSettled] = await Promise.all([
    fetchLegCandidates(
      routingProvider,
      request,
      request.start.coordinates,
      request.destination.coordinates,
      outboundSets,
    ),
    fetchLegCandidates(
      routingProvider,
      request,
      request.destination.coordinates,
      request.start.coordinates,
      inboundSets,
    ),
  ]);

  const outbounds = fulfilledCandidates(outboundSettled);
  const inbounds = fulfilledCandidates(inboundSettled);
  const anchoredOutbounds = anchoredLegCandidates(
    request.start.coordinates,
    request.destination.coordinates,
    outbounds,
  );
  const anchoredInbounds = anchoredLegCandidates(
    request.destination.coordinates,
    request.start.coordinates,
    inbounds,
  );

  if (anchoredOutbounds.length === 0 || anchoredInbounds.length === 0) {
    return {
      ok: false,
      error: errorFromExhaustedAttempts(
        [...outboundSettled, ...inboundSettled],
        {
          message:
            "Aucun aller-retour n’a pu relier ce départ à cette destination puis revenir.",
          suggestions: [
            "Vérifiez les coordonnées.",
            "Essayez un autre couple départ / destination.",
          ],
        },
      ),
    };
  }

  const shortestOutboundKm = Math.min(
    ...anchoredOutbounds.map((candidate) => candidate.distanceKm),
  );
  const shortestInboundKm = Math.min(
    ...anchoredInbounds.map((candidate) => candidate.distanceKm),
  );

  const pairs = anchoredOutbounds.flatMap((outbound) =>
    anchoredInbounds.map((inbound) =>
      composeRoundTripCandidate(outbound, inbound),
    ),
  );
  const shortestDistanceKm = Math.min(
    ...pairs.map((pair) => pair.distanceKm),
  );

  const evaluations = pairs.map((candidate) =>
    evaluateRoundTripCandidate(
      request.start.coordinates,
      request.destination.coordinates,
      candidate,
      request.style,
      {
        targetDistanceKm,
        shortestDistanceKm,
        shortestOutboundKm,
        shortestInboundKm,
      },
    ),
  );

  const selection = selectBestRoundTripCandidate(
    evaluations,
    targetDistanceKm,
    request.preferences.avoidHighways,
    request.preferences.avoidUnpaved,
  );

  if (selection.status === "known_unpaved_rejected") {
    return {
      ok: false,
      error: knowledgeUnavailableError(unpavedKnowledgeError()),
    };
  }

  if (selection.status === "no_route_found") {
    return {
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message:
          "Aucun aller-retour n’a pu relier ce départ à cette destination puis revenir.",
        suggestions: [
          "Vérifiez les coordonnées.",
          "Essayez un autre couple départ / destination.",
        ],
      },
    };
  }

  if (selection.status === "distance_out_of_tolerance") {
    const best = selection.evaluation;
    return {
      ok: false,
      error: {
        code: "DISTANCE_OUT_OF_TOLERANCE",
        message: `Aucun trajet ne respecte ±10 % de ${formatKm(targetDistanceKm ?? 0)} (BR-001). Le meilleur candidat fait ${formatKm(best.candidate.distanceKm)}.`,
        suggestions: [
          "Ajustez la distance cible ou la durée disponible.",
          "Générez sans contrainte de longueur pour un aller-retour différent.",
        ],
        bestCandidate: {
          distanceKm: best.candidate.distanceKm,
          repeatedRoadPercent: best.repeatedRoadPercent,
        },
      },
    };
  }

  const { evaluation } = selection;
  const route: GeneratedRoundTripRoute = {
    id: crypto.randomUUID(),
    type: "round_trip",
    start: request.start,
    destination: request.destination,
    style: request.style,
    targetDistanceKm,
    geometry: evaluation.candidate.geometry,
    segments: evaluation.candidate.segments,
    distanceKm: evaluation.candidate.distanceKm,
    durationMinutes: evaluation.candidate.durationMinutes,
    statistics: {
      repeatedRoadPercent: evaluation.repeatedRoadPercent,
      outboundReturnOverlapPercent: evaluation.outboundReturnOverlapPercent,
    },
    warnings: evaluation.warnings,
  };

  return { ok: true, route };
}

async function fetchLegCandidates(
  routingProvider: RoutingProvider,
  request: RoundTripRideRequest,
  start: Coordinates,
  destination: Coordinates,
  sets: ReturnType<typeof createDestinationWaypointSets>,
): Promise<PromiseSettledResult<DestinationCandidate>[]> {
  return Promise.allSettled(
    sets.map(async (set) => {
      const result = rejectIfKnownUnpavedAvoided(
        await routingProvider.calculateRoute({
          start,
          destination,
          waypoints: set.waypoints,
          style: request.style,
          preferences: request.preferences,
        }),
        request.preferences,
      );
      const candidate: DestinationCandidate = {
        geometry: result.geometry,
        segments: result.segments,
        distanceKm: result.distanceKm,
        durationMinutes: result.durationMinutes,
        waypoints: set.waypoints,
      };
      return candidate;
    }),
  );
}

function fulfilledCandidates(
  settled: PromiseSettledResult<DestinationCandidate>[],
): DestinationCandidate[] {
  return settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

function anchoredLegCandidates(
  start: Coordinates,
  destination: Coordinates,
  candidates: DestinationCandidate[],
): DestinationCandidate[] {
  return candidates.filter((candidate) =>
    isAnchoredDestination(
      evaluateDestinationCandidate(start, destination, candidate, {
        shortestDistanceKm: candidate.distanceKm,
      }),
    ),
  );
}

function formatValidationMessage(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function formatKm(distanceKm: number): string {
  return `${distanceKm.toFixed(1)} km`;
}
