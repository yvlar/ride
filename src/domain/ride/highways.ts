import { HIGHWAY_ROAD_CLASSES } from "./constants";
import type { RouteSegment } from "./types";

const HIGHWAY_CLASS_SET = new Set<string>(HIGHWAY_ROAD_CLASSES);

export const HIGHWAY_AVOIDANCE_WARNING =
  "Ce trajet emprunte une autoroute. Aucune alternative raisonnable n’évite les autoroutes.";

export function isHighwayRoadClass(roadClass?: string): boolean {
  return HIGHWAY_CLASS_SET.has(roadClass?.trim().toLowerCase() ?? "");
}

/** FR-007 — a known highway class, not an unknown or missing class. */
export function usesHighway(segments: RouteSegment[]): boolean {
  return segments.some((segment) => isHighwayRoadClass(segment.roadClass));
}

/**
 * FR-007 — keep a highway-free candidate when one is already reasonable.
 * Callers must pass only candidates that close the trip type without a
 * disproportionate detour or a broken itinerary.
 */
export function preferAvoidingHighways<T>(
  candidates: readonly T[],
  candidateUsesHighway: (candidate: T) => boolean,
  avoidHighways: boolean,
): T[] {
  if (!avoidHighways || candidates.length === 0) {
    return [...candidates];
  }

  const withoutHighway = candidates.filter(
    (candidate) => !candidateUsesHighway(candidate),
  );
  return withoutHighway.length > 0 ? withoutHighway : [...candidates];
}

export function withHighwayAvoidanceSignal<
  T extends { warnings: string[]; candidate: { segments: RouteSegment[] } },
>(evaluation: T, avoidHighways: boolean): T {
  if (!avoidHighways || !usesHighway(evaluation.candidate.segments)) {
    return evaluation;
  }

  if (evaluation.warnings.includes(HIGHWAY_AVOIDANCE_WARNING)) {
    return evaluation;
  }

  return {
    ...evaluation,
    warnings: [...evaluation.warnings, HIGHWAY_AVOIDANCE_WARNING],
  };
}
