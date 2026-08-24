import {
  geometryEntersUnitedStates,
  isInUnitedStates,
} from "@/domain/geo/united-states";
import type { Coordinates, LineString } from "@/domain/geo/types";
import type { RouteSegment } from "./types";

/**
 * FR-028 / BR-009 — known United States geometry is a hard exclusion.
 * Unlike FR-007, there is no fallback onto a crossing corridor.
 */
export function excludeUnitedStatesCrossing<T>(
  candidates: readonly T[],
  candidateEntersUnitedStates: (candidate: T) => boolean,
  stayInCanada: boolean,
): T[] {
  if (!stayInCanada) {
    return [...candidates];
  }

  return candidates.filter(
    (candidate) => !candidateEntersUnitedStates(candidate),
  );
}

export function routeEntersUnitedStates(route: {
  geometry: LineString;
  segments: RouteSegment[];
}): boolean {
  if (geometryEntersUnitedStates(route.geometry)) {
    return true;
  }
  return route.segments.some((segment) =>
    geometryEntersUnitedStates(segment.geometry),
  );
}

export function waypointSetEntersUnitedStates(
  start: Coordinates,
  waypoints: readonly Coordinates[],
): boolean {
  if (isInUnitedStates(start)) {
    return true;
  }
  return waypoints.some((point) => isInUnitedStates(point));
}

export function stayInCanadaEnabled(stayInCanada: boolean | undefined): boolean {
  return stayInCanada === true;
}
