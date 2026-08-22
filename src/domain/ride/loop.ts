import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import {
  firstCoordinates,
  lastCoordinates,
  radiusCoefficientOfVariation,
} from "@/domain/geo/geometry";
import type { Coordinates } from "@/domain/geo/types";
import {
  CIRCULARITY_CV_THRESHOLD,
  HIGH_REPEAT_WARNING_PERCENT,
  LOOP_CLOSURE_TOLERANCE_KM,
  MIN_ROAD_NETWORK_POINTS,
} from "./constants";
import { distanceToleranceGapKm, isWithinDistanceTolerance } from "./constraints";
import { curvyRankScore } from "./curvy";
import { measureRepeatedRoadPercent } from "./overlap";
import { scenicRankScore } from "./scenic";
import type { LoopCandidate, RideStyle } from "./types";

export type LoopWaypointSet = {
  bearingDeg: number;
  radiusKm: number;
  waypoints: Coordinates[];
};

/**
 * FR-001 — candidate waypoint rings around the start.
 * The geometric ring is only a seed; the routing provider must snap it to roads.
 */
export function createLoopWaypointSets(
  start: Coordinates,
  targetDistanceKm: number,
): LoopWaypointSet[] {
  const bearings = [0, 90, 180, 270];
  const radiusFactors = [1 / 4, 1 / 3];
  const sets: LoopWaypointSet[] = [];

  for (const bearingDeg of bearings) {
    for (const factor of radiusFactors) {
      const radiusKm = targetDistanceKm * factor;
      sets.push({
        bearingDeg,
        radiusKm,
        waypoints: squareWaypoints(start, bearingDeg, radiusKm),
      });
      sets.push({
        bearingDeg,
        radiusKm,
        waypoints: triangleWaypoints(start, bearingDeg, radiusKm),
      });
    }
  }

  return sets;
}

function squareWaypoints(
  start: Coordinates,
  bearingDeg: number,
  sideKm: number,
): Coordinates[] {
  return [
    offsetCoordinates(start, bearingDeg, sideKm),
    offsetCoordinates(start, bearingDeg + 45, sideKm * Math.SQRT2),
    offsetCoordinates(start, bearingDeg + 90, sideKm),
  ];
}

function triangleWaypoints(
  start: Coordinates,
  bearingDeg: number,
  sideKm: number,
): Coordinates[] {
  return [
    offsetCoordinates(start, bearingDeg, sideKm),
    offsetCoordinates(start, bearingDeg + 60, sideKm),
  ];
}

export type EvaluatedLoopCandidate = {
  candidate: LoopCandidate;
  isClosed: boolean;
  followsRoadNetwork: boolean;
  isGeometricCircle: boolean;
  withinDistanceTolerance: boolean;
  repeatedRoadPercent: number;
  curvyScore: number;
  scenicScore: number;
  warnings: string[];
};

export function isClosedLoop(
  start: Coordinates,
  candidate: LoopCandidate,
): boolean {
  const first = firstCoordinates(candidate.geometry);
  const last = lastCoordinates(candidate.geometry);
  if (!first || !last) {
    return false;
  }

  return (
    haversineKm(start, first) <= LOOP_CLOSURE_TOLERANCE_KM &&
    haversineKm(start, last) <= LOOP_CLOSURE_TOLERANCE_KM
  );
}

export function followsRoadNetwork(candidate: LoopCandidate): boolean {
  return candidate.geometry.coordinates.length >= MIN_ROAD_NETWORK_POINTS;
}

export function isGeometricCircle(candidate: LoopCandidate): boolean {
  return (
    radiusCoefficientOfVariation(candidate.geometry) < CIRCULARITY_CV_THRESHOLD
  );
}

export function evaluateLoopCandidate(
  start: Coordinates,
  targetDistanceKm: number,
  candidate: LoopCandidate,
): EvaluatedLoopCandidate {
  const closed = isClosedLoop(start, candidate);
  const roadNetwork = followsRoadNetwork(candidate);
  const circular = isGeometricCircle(candidate);
  const withinTolerance = isWithinDistanceTolerance(
    candidate.distanceKm,
    targetDistanceKm,
  );
  const repeatedRoadPercent = measureRepeatedRoadPercent(candidate.geometry);
  const warnings: string[] = [];

  if (repeatedRoadPercent >= HIGH_REPEAT_WARNING_PERCENT) {
    warnings.push(
      `Ce trajet réutilise ${Math.round(repeatedRoadPercent)} % des mêmes routes.`,
    );
  }

  return {
    candidate,
    isClosed: closed,
    followsRoadNetwork: roadNetwork,
    isGeometricCircle: circular,
    withinDistanceTolerance: withinTolerance,
    repeatedRoadPercent,
    curvyScore: curvyRankScore(candidate.geometry, candidate.segments),
    scenicScore: scenicRankScore(candidate.geometry, candidate.segments),
    warnings,
  };
}

export function isViableLoop(evaluation: EvaluatedLoopCandidate): boolean {
  return (
    evaluation.isClosed &&
    evaluation.followsRoadNetwork &&
    !evaluation.isGeometricCircle
  );
}

export type LoopSelection =
  | {
      status: "selected";
      evaluation: EvaluatedLoopCandidate;
    }
  | {
      status: "distance_out_of_tolerance";
      evaluation: EvaluatedLoopCandidate;
    }
  | {
      status: "geometric_loop_rejected";
    }
  | {
      status: "no_route_found";
    };

export function selectBestLoopCandidate(
  evaluations: EvaluatedLoopCandidate[],
  targetDistanceKm: number,
  style?: RideStyle,
): LoopSelection {
  const viable = evaluations.filter(isViableLoop);
  if (viable.length === 0) {
    const onlyCircles =
      evaluations.length > 0 &&
      evaluations.every((evaluation) => evaluation.isGeometricCircle);
    if (onlyCircles) {
      return { status: "geometric_loop_rejected" };
    }
    return { status: "no_route_found" };
  }

  const inTolerance = viable.filter(
    (evaluation) => evaluation.withinDistanceTolerance,
  );
  const pool = inTolerance.length > 0 ? inTolerance : viable;

  const ranked = [...pool].sort((left, right) => {
    const repeatDelta = left.repeatedRoadPercent - right.repeatedRoadPercent;
    const leftStyle = loopStyleScore(left, style);
    const rightStyle = loopStyleScore(right, style);
    if (leftStyle !== null && rightStyle !== null) {
      const leftWarned =
        left.repeatedRoadPercent >= HIGH_REPEAT_WARNING_PERCENT;
      const rightWarned =
        right.repeatedRoadPercent >= HIGH_REPEAT_WARNING_PERCENT;
      // BR-002 — a warned loop must not beat a cleaner alternative.
      if (leftWarned !== rightWarned) {
        return repeatDelta;
      }
      const styleDelta = rightStyle - leftStyle;
      if (styleDelta !== 0) {
        return styleDelta;
      }
    }
    if (repeatDelta !== 0) {
      return repeatDelta;
    }
    return (
      distanceToleranceGapKm(left.candidate.distanceKm, targetDistanceKm) -
      distanceToleranceGapKm(right.candidate.distanceKm, targetDistanceKm)
    );
  });

  const best = ranked[0];
  if (!best) {
    return { status: "no_route_found" };
  }

  if (!best.withinDistanceTolerance) {
    return { status: "distance_out_of_tolerance", evaluation: best };
  }

  return { status: "selected", evaluation: best };
}

function loopStyleScore(
  evaluation: EvaluatedLoopCandidate,
  style?: RideStyle,
): number | null {
  if (style === "curvy") {
    return evaluation.curvyScore;
  }
  if (style === "scenic") {
    return evaluation.scenicScore;
  }
  return null;
}
