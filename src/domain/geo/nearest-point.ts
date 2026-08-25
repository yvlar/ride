import {
  haversineKm,
  initialBearingDeg,
  positionToCoordinates,
} from "./distance";
import { agentDebugLog } from "@/domain/gpx/_agent-debug-log";
import type { Coordinates, LineString } from "./types";

export type NearestPointOnLine = {
  point: Coordinates;
  segmentIndex: number;
  t: number;
  distanceM: number;
  progressKm: number;
  remainingDistanceKm: number;
  bearingDeg: number;
};

export type NearestPointOptions = {
  previousProgressKm?: number | null;
  headingDeg?: number | null;
  gapBeforeVertex?: ReadonlySet<number>;
  tieDistanceM?: number;
  headingPenaltyM?: number;
  reversePenaltyM?: number;
  progressPenaltyMPerKm?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function headingDeltaDeg(fromBearing: number, toBearing: number): number {
  const raw = Math.abs(toBearing - fromBearing) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function toLocalKm(origin: Coordinates, point: Coordinates): { x: number; y: number } {
  const meanLat = ((origin.latitude + point.latitude) / 2) * (Math.PI / 180);
  return {
    x: (point.longitude - origin.longitude) * 111.32 * Math.cos(meanLat),
    y: (point.latitude - origin.latitude) * 111.32,
  };
}

export function closestPointOnSegment(
  point: Coordinates,
  from: Coordinates,
  to: Coordinates,
): { point: Coordinates; t: number; distanceKm: number } {
  const p = toLocalKm(from, point);
  const a = toLocalKm(from, from);
  const b = toLocalKm(from, to);
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const length2 = vx * vx + vy * vy;
  const t =
    length2 === 0
      ? 0
      : clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / length2, 0, 1);
  const snapped = {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
  };
  return {
    point: snapped,
    t,
    distanceKm: haversineKm(point, snapped),
  };
}

/**
 * True nearest point on a polyline (FR-039), including mid-segment
 * projections. Gaps between non-contiguous parts are skipped.
 */
export function nearestPointOnLine(
  point: Coordinates,
  geometry: LineString,
  options: NearestPointOptions = {},
): NearestPointOnLine | null {
  if (geometry.coordinates.length < 2) {
    return null;
  }

  const gaps = options.gapBeforeVertex ?? new Set<number>();
  const candidates: NearestPointOnLine[] = [];
  let traveledKm = 0;

  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const from = positionToCoordinates(geometry.coordinates[index - 1]!);
    const to = positionToCoordinates(geometry.coordinates[index]!);
    const segmentKm = haversineKm(from, to);
    const isGap = gaps.has(index);
    if (!isGap) {
      const closest = closestPointOnSegment(point, from, to);
      candidates.push({
        point: closest.point,
        segmentIndex: index - 1,
        t: closest.t,
        distanceM: closest.distanceKm * 1_000,
        progressKm: traveledKm + closest.t * segmentKm,
        remainingDistanceKm: 0,
        bearingDeg: initialBearingDeg(from, to),
      });
    }
    if (!isGap) {
      traveledKm += segmentKm;
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const previous = options.previousProgressKm ?? null;
  const heading = options.headingDeg;
  const progressPenalty = options.progressPenaltyMPerKm ?? 250;
  const headingPenalty = options.headingPenaltyM ?? 40;
  const reversePenalty = options.reversePenaltyM ?? 80;

  function score(candidate: NearestPointOnLine): number {
    let value = candidate.distanceM;
    if (previous !== null) {
      value += progressPenalty * Math.abs(candidate.progressKm - previous);
      if (candidate.progressKm + 0.02 < previous) {
        value += reversePenalty;
      }
    }
    if (typeof heading === "number" && Number.isFinite(heading)) {
      value += (headingDeltaDeg(heading, candidate.bearingDeg) / 180) * headingPenalty;
    }
    value += candidate.segmentIndex * 0.001;
    return value;
  }

  const best = candidates.reduce((current, candidate) =>
    score(candidate) < score(current) ? candidate : current,
  );

  // #region agent log
  {
    const nearTie = candidates.filter(
      (candidate) => Math.abs(candidate.distanceM - best.distanceM) <= 25,
    );
    if (nearTie.length > 1) {
      const ranked = [...candidates]
        .sort((left, right) => score(left) - score(right))
        .slice(0, 3)
        .map((candidate) => ({
          segmentIndex: candidate.segmentIndex,
          progressKm: candidate.progressKm,
          distanceM: candidate.distanceM,
          score: score(candidate),
        }));
      agentDebugLog({
        hypothesisId: "H4",
        location: "nearest-point.ts:nearestPointOnLine",
        message: "nearestPointOnLine near-tie branch pick",
        data: {
          previousProgressKm: previous,
          headingDeg: heading ?? null,
          candidateCount: candidates.length,
          bestSegmentIndex: best.segmentIndex,
          bestProgressKm: best.progressKm,
          bestDistanceM: best.distanceM,
          nearTieCount: nearTie.length,
          nearTieSegments: nearTie.map((candidate) => candidate.segmentIndex),
          top3: ranked,
        },
      });
    }
  }
  // #endregion

  return {
    ...best,
    remainingDistanceKm: Math.max(0, traveledKm - best.progressKm),
  };
}
