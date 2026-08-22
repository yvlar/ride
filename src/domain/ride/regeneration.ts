import type { LineString } from "@/domain/geo/types";
import { REGENERATION_MAX_OVERLAP_PERCENT } from "./constants";
import { measureOverlapPercent } from "./overlap";
import type { RideGenerationError } from "./types";

/**
 * BR-006 — a regeneration is visibly different when overlap with the previous
 * corridor does not exceed the implementation threshold.
 */
export function isVisiblyDifferentCorridor(
  previous: LineString,
  candidate: LineString,
  maxOverlapPercent = REGENERATION_MAX_OVERLAP_PERCENT,
): boolean {
  return measureOverlapPercent(previous, candidate) <= maxOverlapPercent;
}

/** FR-012 / BR-006 — drop candidates that reuse the previous corridor. */
export function excludeSimilarToPrevious<T>(
  evaluations: T[],
  previous: LineString,
  getGeometry: (evaluation: T) => LineString,
): T[] {
  return evaluations.filter((evaluation) =>
    isVisiblyDifferentCorridor(previous, getGeometry(evaluation)),
  );
}

export function regenerationOverlapError(): RideGenerationError {
  return {
    code: "NO_ROUTE_FOUND",
    message:
      "Aucune variante suffisamment différente n’a pu être trouvée. Le réseau routier limite les corridors alternatifs (FR-012, BR-006).",
    suggestions: [
      "Modifiez le départ, la distance ou les préférences d’évitement.",
      "Acceptez le trajet actuel si le réseau n’offre pas d’autre corridor.",
    ],
  };
}
