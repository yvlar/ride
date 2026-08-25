import { DISTANCE_TOLERANCE_PERCENT } from "./constants";
import type { RouteSegment } from "./types";

export type DistanceBoundsKm = {
  minDistanceKm: number;
  maxDistanceKm: number;
};

/** BR-001 — ±10 % around the requested or estimated distance. */
export function distanceBoundsKm(targetDistanceKm: number): DistanceBoundsKm {
  return {
    minDistanceKm:
      (targetDistanceKm * (100 - DISTANCE_TOLERANCE_PERCENT)) / 100,
    maxDistanceKm:
      (targetDistanceKm * (100 + DISTANCE_TOLERANCE_PERCENT)) / 100,
  };
}

export function isWithinDistanceTolerance(
  distanceKm: number,
  targetDistanceKm: number,
): boolean {
  const { minDistanceKm, maxDistanceKm } = distanceBoundsKm(targetDistanceKm);
  return distanceKm >= minDistanceKm && distanceKm <= maxDistanceKm;
}

export function distanceToleranceGapKm(
  distanceKm: number,
  targetDistanceKm: number,
): number {
  const { minDistanceKm, maxDistanceKm } = distanceBoundsKm(targetDistanceKm);
  if (distanceKm < minDistanceKm) {
    return minDistanceKm - distanceKm;
  }
  if (distanceKm > maxDistanceKm) {
    return distanceKm - maxDistanceKm;
  }
  return 0;
}

/** BR-001 — explain a real distance instead of silently widening ±10 %. */
export function distanceToleranceExplanationKm(
  distanceKm: number,
  targetDistanceKm: number,
): string | null {
  if (isWithinDistanceTolerance(distanceKm, targetDistanceKm)) {
    return null;
  }
  return `La distance réelle est de ${distanceKm.toFixed(1)} km pour une demande de ${targetDistanceKm.toFixed(0)} km (±10 % non atteint).`;
}

/** BR-007 — a known unpaved surface, not an unknown one. */
export function usesKnownUnpaved(segments: RouteSegment[]): boolean {
  return segments.some((segment) => segment.surface === "unpaved");
}
