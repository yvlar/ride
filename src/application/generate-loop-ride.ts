import { resolveTargetDistanceKm } from "@/domain/ride/duration";
import {
  createLoopWaypointSets,
  evaluateLoopCandidate,
  selectBestLoopCandidate,
} from "@/domain/ride/loop";
import {
  loopRideRequestSchema,
  unsupportedRideTypeMessage,
} from "@/domain/ride/schemas";
import type {
  GeneratedLoopRoute,
  LoopCandidate,
  LoopRideRequest,
  RideGenerationError,
} from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";

export type GenerateLoopRideResult =
  | { ok: true; route: GeneratedLoopRoute }
  | { ok: false; error: RideGenerationError };

export async function generateLoopRide(
  input: unknown,
  routingProvider: RoutingProvider = createRoutingProvider(),
): Promise<GenerateLoopRideResult> {
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
        suggestions: [
          'Utilisez type: "loop" avec un départ et une distance cible.',
        ],
      },
    };
  }

  const parsed = loopRideRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: formatValidationMessage(parsed.error),
        suggestions: [
          "Indiquez un point de départ et une distance cible en kilomètres, ou une durée disponible.",
        ],
      },
    };
  }

  return generateValidatedLoop(parsed.data, routingProvider);
}

async function generateValidatedLoop(
  request: LoopRideRequest,
  routingProvider: RoutingProvider,
): Promise<GenerateLoopRideResult> {
  const targetDistanceKm = resolveTargetDistanceKm(request);
  if (targetDistanceKm === undefined) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          "Une boucle exige une distance cible ou une durée disponible (FR-001).",
        suggestions: [
          "Fournissez targetDistanceKm ou availableDurationMinutes.",
        ],
      },
    };
  }

  const waypointSets = createLoopWaypointSets(
    request.start.coordinates,
    targetDistanceKm,
  );

  const evaluations = await Promise.all(
    waypointSets.map(async (set) => {
      const result = await routingProvider.calculateRoute({
        start: request.start.coordinates,
        destination: request.start.coordinates,
        waypoints: set.waypoints,
      });
      const candidate: LoopCandidate = {
        geometry: result.geometry,
        segments: result.segments,
        distanceKm: result.distanceKm,
        durationMinutes: result.durationMinutes,
        waypoints: set.waypoints,
      };
      return evaluateLoopCandidate(
        request.start.coordinates,
        targetDistanceKm,
        candidate,
      );
    }),
  );

  const selection = selectBestLoopCandidate(evaluations, targetDistanceKm);

  if (selection.status === "geometric_loop_rejected") {
    return {
      ok: false,
      error: {
        code: "GEOMETRIC_LOOP_REJECTED",
        message:
          "Le tracé obtenu est une boucle géométrique, pas un itinéraire sur le réseau routier (FR-001).",
        suggestions: [
          "Vérifiez le fournisseur de routage. Une boucle doit suivre des routes réelles.",
        ],
      },
    };
  }

  if (selection.status === "no_route_found") {
    return {
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: "Aucun trajet en boucle n’a pu être construit depuis ce départ.",
        suggestions: ["Essayez un autre point de départ."],
      },
    };
  }

  if (selection.status === "distance_out_of_tolerance") {
    const best = selection.evaluation;
    return {
      ok: false,
      error: {
        code: "DISTANCE_OUT_OF_TOLERANCE",
        message: `Aucun trajet ne respecte ±10 % de ${formatKm(targetDistanceKm)} (BR-001). Le meilleur candidat fait ${formatKm(best.candidate.distanceKm)}.`,
        suggestions: [
          "Ajustez la distance cible.",
          "Essayez un autre point de départ.",
        ],
        bestCandidate: {
          distanceKm: best.candidate.distanceKm,
          repeatedRoadPercent: best.repeatedRoadPercent,
        },
      },
    };
  }

  const { evaluation } = selection;
  const route: GeneratedLoopRoute = {
    id: crypto.randomUUID(),
    type: "loop",
    start: request.start,
    targetDistanceKm,
    geometry: evaluation.candidate.geometry,
    segments: evaluation.candidate.segments,
    distanceKm: evaluation.candidate.distanceKm,
    durationMinutes: evaluation.candidate.durationMinutes,
    statistics: {
      repeatedRoadPercent: evaluation.repeatedRoadPercent,
    },
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
