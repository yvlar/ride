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
import { appendFileSync } from "node:fs";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import { isRoutingKnowledgeError } from "@/infrastructure/routing/routing-knowledge-error";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";
import {
  errorFromExhaustedAttempts,
  knowledgeUnavailableError,
  primaryKnowledgeError,
  rejectIfKnownUnpavedAvoided,
} from "./routing-failure";

export type GenerateLoopRideResult =
  | { ok: true; route: GeneratedLoopRoute }
  | { ok: false; error: RideGenerationError };

export async function generateLoopRide(
  input: unknown,
  routingProvider?: RoutingProvider,
): Promise<GenerateLoopRideResult> {
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

  return generateValidatedLoop(parsed.data, provider);
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

  const settled = await Promise.allSettled(
    waypointSets.map(async (set) => {
      const result = rejectIfKnownUnpavedAvoided(
        await routingProvider.calculateRoute({
          start: request.start.coordinates,
          destination: request.start.coordinates,
          waypoints: set.waypoints,
          style: request.style,
          preferences: request.preferences,
        }),
        request.preferences,
      );
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
  const evaluations = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  // #region agent log
  {
    const knowledge = primaryKnowledgeError(settled);
    const settledMeta = settled.map((result) => ({
      status: result.status,
      isKnowledge:
        result.status === "rejected" && isRoutingKnowledgeError(result.reason),
      knowledgeReason:
        result.status === "rejected" && isRoutingKnowledgeError(result.reason)
          ? result.reason.reason
          : null,
      isGeometricCircle:
        result.status === "fulfilled" ? result.value.isGeometricCircle : null,
      isClosed: result.status === "fulfilled" ? result.value.isClosed : null,
      followsRoadNetwork:
        result.status === "fulfilled" ? result.value.followsRoadNetwork : null,
    }));
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({
        hypothesisId: "A",
        location: "generate-loop-ride.ts:afterSettled",
        message: "loop settled statuses vs evaluations",
        data: {
          settledCount: settled.length,
          fulfilled: settled.filter((result) => result.status === "fulfilled")
            .length,
          rejected: settled.filter((result) => result.status === "rejected")
            .length,
          knowledgeRejections: settledMeta.filter((item) => item.isKnowledge)
            .length,
          evaluationsLength: evaluations.length,
          skippedExhaustedPath: evaluations.length > 0,
          everyAttemptFailed: settled.every(
            (result) => result.status === "rejected",
          ),
          primaryKnowledgeExists: Boolean(knowledge),
          primaryKnowledgeReason: knowledge?.reason ?? null,
          settledMeta,
        },
        timestamp: Date.now(),
      })}\n`,
    );
  }
  // #endregion

  if (evaluations.length === 0) {
    return {
      ok: false,
      error: errorFromExhaustedAttempts(settled, {
        message: "Aucun trajet en boucle n’a pu être construit depuis ce départ.",
        suggestions: ["Essayez un autre point de départ."],
      }),
    };
  }

  const selection = selectBestLoopCandidate(evaluations, targetDistanceKm);

  // #region agent log
  {
    const knowledge = primaryKnowledgeError(settled);
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({
        hypothesisId: "B",
        location: "generate-loop-ride.ts:afterSelection",
        message: "loop selection ignores rejected knowledge errors",
        data: {
          selectionStatus: selection.status,
          evaluationsLength: evaluations.length,
          primaryKnowledgeExists: Boolean(knowledge),
          primaryKnowledgeReason: knowledge?.reason ?? null,
          returnedGeometric: selection.status === "geometric_loop_rejected",
          returnedGenericNoRoute: selection.status === "no_route_found",
        },
        timestamp: Date.now(),
      })}\n`,
    );
  }
  // #endregion

  if (
    selection.status === "geometric_loop_rejected" ||
    selection.status === "no_route_found"
  ) {
    const knowledge = primaryKnowledgeError(settled);
    // #region agent log
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({
        hypothesisId: "A",
        location: "generate-loop-ride.ts:unselectable",
        message: "loop unselectable path",
        data: {
          selectionStatus: selection.status,
          primaryKnowledgeExists: Boolean(knowledge),
          primaryKnowledgeReason: knowledge?.reason ?? null,
          chosen: knowledge
            ? "knowledge"
            : selection.status === "geometric_loop_rejected"
              ? "geometric"
              : "generic",
        },
        timestamp: Date.now(),
      })}\n`,
    );
    // #endregion
    if (knowledge) {
      return { ok: false, error: knowledgeUnavailableError(knowledge) };
    }
  }

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
      error: errorFromExhaustedAttempts(settled, {
        message: "Aucun trajet en boucle n’a pu être construit depuis ce départ.",
        suggestions: ["Essayez un autre point de départ."],
      }),
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
