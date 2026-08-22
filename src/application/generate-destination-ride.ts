import {
  resolveTargetDistanceKm,
  withAvailableDurationCeiling,
} from "@/domain/ride/duration";
import {
  createDestinationWaypointSets,
  evaluateDestinationCandidate,
  isAnchoredDestination,
  selectBestDestinationCandidate,
} from "@/domain/ride/destination";
import { destinationRideRequestSchema } from "@/domain/ride/schemas";
import type {
  DestinationCandidate,
  DestinationRideRequest,
  GeneratedDestinationRoute,
  RideGenerationError,
} from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import { unpavedKnowledgeError } from "@/infrastructure/routing/routing-knowledge-error";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";
import {
  errorFromExhaustedAttempts,
  knowledgeUnavailableError,
  primaryKnowledgeError,
  rejectIfKnownUnpavedAvoided,
  withKnowledgeConstraint,
} from "./routing-failure";

export type GenerateDestinationRideResult =
  | { ok: true; route: GeneratedDestinationRoute }
  | { ok: false; error: RideGenerationError };

export async function generateDestinationRide(
  input: unknown,
  routingProvider?: RoutingProvider,
): Promise<GenerateDestinationRideResult> {
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

  if (type !== "destination") {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_RIDE_TYPE",
        message:
          type === "loop"
            ? "Le type de trajet « loop » n’est pas pris en charge par le générateur de destination. Utilisez le générateur FR-001."
            : type === "round_trip"
              ? "Le type de trajet « round_trip » n’est pas pris en charge par le générateur de destination. Utilisez le générateur FR-003."
              : "Seuls les types « loop » (FR-001), « destination » (FR-002) et « round_trip » (FR-003) sont pris en charge.",
        suggestions: [
          'Utilisez type: "destination" avec un départ, une destination et un style.',
        ],
      },
    };
  }

  const parsed = destinationRideRequestSchema.safeParse(input);
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

  return generateValidatedDestination(
    {
      ...parsed.data,
      // FR-007 and FR-008 are applied in domain selection.
      preferences: parsed.data.preferences ?? {
        avoidHighways: false,
        avoidUnpaved: false,
      },
    },
    provider,
  );
}

async function generateValidatedDestination(
  request: DestinationRideRequest,
  routingProvider: RoutingProvider,
): Promise<GenerateDestinationRideResult> {
  const targetDistanceKm = resolveTargetDistanceKm(request);
  const waypointSets = createDestinationWaypointSets(
    request.start.coordinates,
    request.destination.coordinates,
    targetDistanceKm,
  );

  const settled = await Promise.allSettled(
    waypointSets.map(async (set) => {
      const result = rejectIfKnownUnpavedAvoided(
        await routingProvider.calculateRoute({
          start: request.start.coordinates,
          destination: request.destination.coordinates,
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
  const candidates = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      error: errorFromExhaustedAttempts(settled, {
        message:
          "Aucun trajet moto n’a pu relier ce départ à cette destination.",
        suggestions: [
          "Vérifiez les coordonnées.",
          "Essayez un autre couple départ / destination.",
        ],
      }),
    };
  }

  const preliminary = candidates.map((candidate) =>
    evaluateDestinationCandidate(
      request.start.coordinates,
      request.destination.coordinates,
      candidate,
      {
        targetDistanceKm,
        shortestDistanceKm: candidate.distanceKm,
      },
    ),
  );
  const anchored = preliminary.filter(isAnchoredDestination);
  const shortestDistanceKm =
    anchored.length > 0
      ? Math.min(
          ...anchored.map((evaluation) => evaluation.candidate.distanceKm),
        )
      : 0;

  const evaluations = candidates.map((candidate) =>
    evaluateDestinationCandidate(
      request.start.coordinates,
      request.destination.coordinates,
      candidate,
      {
        targetDistanceKm,
        shortestDistanceKm,
      },
    ),
  );

  const selection = selectBestDestinationCandidate(
    evaluations,
    request.style,
    targetDistanceKm,
    request.preferences.avoidHighways,
    request.preferences.avoidUnpaved,
  );
  const knowledge = primaryKnowledgeError(settled);

  if (selection.status === "known_unpaved_rejected") {
    return {
      ok: false,
      error: knowledgeUnavailableError(unpavedKnowledgeError()),
    };
  }

  if (selection.status === "no_route_found") {
    return {
      ok: false,
      error: errorFromExhaustedAttempts(settled, {
        message:
          "Aucun trajet moto n’a pu relier ce départ à cette destination.",
        suggestions: [
          "Vérifiez les coordonnées.",
          "Essayez un autre couple départ / destination.",
        ],
      }),
    };
  }

  if (selection.status === "distance_out_of_tolerance") {
    const best = selection.evaluation;
    const error = withKnowledgeConstraint(
      {
        code: "DISTANCE_OUT_OF_TOLERANCE",
        message: `Aucun trajet ne respecte ±10 % de ${formatKm(targetDistanceKm ?? 0)} (BR-001). Le meilleur candidat fait ${formatKm(best.candidate.distanceKm)}.`,
        suggestions: [
          "Ajustez la distance cible ou la durée disponible.",
          "Générez sans contrainte de longueur pour relier simplement la destination.",
        ],
        bestCandidate: {
          distanceKm: best.candidate.distanceKm,
        },
      },
      knowledge,
    );
    return { ok: false, error };
  }

  const evaluation = withAvailableDurationCeiling(selection.evaluation, {
    availableDurationMinutes: request.availableDurationMinutes,
    explicitTargetDistanceKm: request.targetDistanceKm,
  });
  const route: GeneratedDestinationRoute = {
    id: crypto.randomUUID(),
    type: "destination",
    start: request.start,
    destination: request.destination,
    style: request.style,
    targetDistanceKm,
    geometry: evaluation.candidate.geometry,
    segments: evaluation.candidate.segments,
    distanceKm: evaluation.candidate.distanceKm,
    durationMinutes: evaluation.candidate.durationMinutes,
    warnings: evaluation.warnings,
  };

  return { ok: true, route };
}

function formatValidationMessage(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function formatKm(distanceKm: number): string {
  return `${distanceKm.toFixed(1)} km`;
}
