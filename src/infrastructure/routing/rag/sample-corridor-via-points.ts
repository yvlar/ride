import {
  haversineKm,
  initialBearingDeg,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";

/** FR-029 — keep via-points sparse enough for a road-network adapter. */
export const CORRIDOR_VIA_MIN_SPACING_KM = 8;
export const CORRIDOR_VIA_TARGET_SPACING_KM = 10;
export const CORRIDOR_VIA_MAX_POINTS = 12;
export const CORRIDOR_VIA_TURN_DEG = 45;
const DEDUPE_KM = 0.05;

function headingDeltaDeg(fromBearing: number, toBearing: number): number {
  const raw = Math.abs(fromBearing - toBearing) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * Sample intermediate vertices from a RAG corridor so a road-network adapter
 * can snap the displayed geometry. Endpoints are excluded (FR-001 / NFR-005).
 */
export function sampleCorridorViaPoints(
  geometry: LineString,
  options?: {
    minSpacingKm?: number;
    targetSpacingKm?: number;
    maxPoints?: number;
    turnDeg?: number;
  },
): Coordinates[] {
  const minSpacingKm = options?.minSpacingKm ?? CORRIDOR_VIA_MIN_SPACING_KM;
  const targetSpacingKm =
    options?.targetSpacingKm ?? CORRIDOR_VIA_TARGET_SPACING_KM;
  const maxPoints = options?.maxPoints ?? CORRIDOR_VIA_MAX_POINTS;
  const turnDeg = options?.turnDeg ?? CORRIDOR_VIA_TURN_DEG;
  const points = geometry.coordinates.map(positionToCoordinates);
  if (points.length < 3) {
    return [];
  }

  const selected: Coordinates[] = [];
  if (!points[0]) {
    return [];
  }

  let distSinceKept = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!previous || !current || !next) {
      continue;
    }

    distSinceKept += haversineKm(previous, current);
    if (distSinceKept < minSpacingKm) {
      continue;
    }

    const turn = headingDeltaDeg(
      initialBearingDeg(previous, current),
      initialBearingDeg(current, next),
    );
    if (turn < turnDeg && distSinceKept < targetSpacingKm) {
      continue;
    }

    selected.push(current);
    distSinceKept = 0;
  }

  if (selected.length > 0) {
    return capViaPoints(selected, maxPoints);
  }

  const middleIndex = Math.floor(points.length / 2);
  if (middleIndex > 0 && middleIndex < points.length - 1) {
    const middle = points[middleIndex];
    return middle ? [middle] : [];
  }
  return [];
}

export function thinCorridorViaPoints(
  vias: Coordinates[],
  keep: number,
): Coordinates[] {
  return capViaPoints(vias, keep);
}

function capViaPoints(points: Coordinates[], maxPoints: number): Coordinates[] {
  if (maxPoints <= 0 || points.length === 0) {
    return [];
  }
  if (points.length <= maxPoints) {
    return points;
  }
  if (maxPoints === 1) {
    const middle = points[Math.floor(points.length / 2)];
    return middle ? [middle] : [];
  }

  const sampled: Coordinates[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(
      (index * (points.length - 1)) / (maxPoints - 1),
    );
    const point = points[sourceIndex];
    const previous = sampled[sampled.length - 1];
    if (!point) {
      continue;
    }
    if (previous && haversineKm(previous, point) < DEDUPE_KM) {
      continue;
    }
    sampled.push(point);
  }
  return sampled;
}

/**
 * FR-029 — snap retries stay on the retrieved corridor. An empty waypoint
 * list is only used when the corridor has no intermediate vertices.
 */
export function corridorSnapAttempts(
  sampled: Coordinates[],
  originalWaypoints: Coordinates[] = [],
): Coordinates[][] {
  if (sampled.length === 0) {
    // Empty samples occur only for two-point chords; sampling keeps at least
    // one intermediate vertex whenever the corridor has shape.
    return uniqueWaypointAttempts([originalWaypoints]);
  }

  return uniqueWaypointAttempts([
    sampled,
    thinCorridorViaPoints(sampled, Math.ceil(sampled.length / 2)),
    thinCorridorViaPoints(sampled, Math.min(3, sampled.length)),
  ]).filter((attempt) => attempt.length > 0);
}

export function uniqueWaypointAttempts(
  attempts: Coordinates[][],
): Coordinates[][] {
  const seen = new Set<string>();
  const unique: Coordinates[][] = [];
  for (const attempt of attempts) {
    const key = waypointAttemptKey(attempt);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(attempt);
  }
  return unique;
}

function waypointAttemptKey(points: Coordinates[]): string {
  return points
    .map(
      (point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`,
    )
    .join("|");
}
