import { appendFileSync } from "node:fs";
import { resolveTargetDistanceKm } from "@/domain/ride/duration";
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
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";
import {
  errorFromExhaustedAttempts,
  primaryKnowledgeError,
  rejectIfKnownUnpavedAvoided,
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
              ? "Le type de trajet « round_trip » n’est pas encore pris en charge. Les types loop (FR-001) et destination (FR-002) le sont."
              : "Seuls les types « loop » (FR-001) et « destination » (FR-002) sont pris en charge.",
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
      // Preferences are forwarded to the routing port. FR-007 / FR-008 are
      // not treated as delivered domain rules here.
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
  );
  const knowledge = primaryKnowledgeError(settled);
  // #region agent log
  appendFileSync("/opt/cursor/logs/debug.log",JSON.stringify({hypothesisId:"C",location:"generate-destination-ride.ts:select",message:"destination selection vs knowledge",data:{selectionStatus:selection.status,candidateCount:candidates.length,evaluationCount:evaluations.length,fulfilledCount:settled.filter((r)=>r.status==="fulfilled").length,rejectedCount:settled.filter((r)=>r.status==="rejected").length,knowledgeReason:knowledge?.reason??null,knowledgeChecked:selection.status==="no_route_found",willOmitKnowledge:selection.status==="distance_out_of_tolerance"&&Boolean(knowledge)},timestamp:Date.now()})+"\n");
  // #endregion

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
    const message = `Aucun trajet ne respecte ±10 % de ${formatKm(targetDistanceKm ?? 0)} (BR-001). Le meilleur candidat fait ${formatKm(best.candidate.distanceKm)}.`;
    // #region agent log
    appendFileSync("/opt/cursor/logs/debug.log",JSON.stringify({hypothesisId:"D",location:"generate-destination-ride.ts:distance_out_of_tolerance",message:"distance path omits knowledge",data:{selectionStatus:selection.status,knowledgeReason:knowledge?.reason??null,knowledgeMessage:knowledge?.message??null,willOmitKnowledge:Boolean(knowledge),returnedCode:"DISTANCE_OUT_OF_TOLERANCE",returnedMessageHasFr021:message.includes("FR-021"),returnedMessageHasUnpaved:message.includes("non pavées"),bestDistanceKm:best.candidate.distanceKm,targetDistanceKm:targetDistanceKm??null},timestamp:Date.now()})+"\n");
    // #endregion
    return {
      ok: false,
      error: {
        code: "DISTANCE_OUT_OF_TOLERANCE",
        message,
        suggestions: [
          "Ajustez la distance cible ou la durée disponible.",
          "Générez sans contrainte de longueur pour relier simplement la destination.",
        ],
        bestCandidate: {
          distanceKm: best.candidate.distanceKm,
        },
      },
    };
  }

  const { evaluation } = selection;
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
