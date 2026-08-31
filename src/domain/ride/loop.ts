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
import {
  excludeUnitedStatesCrossing,
  routeEntersUnitedStates,
  stayInCanadaEnabled,
  waypointSetEntersUnitedStates,
} from "./canada";
import {
  distanceToleranceGapKm,
  isWithinDistanceTolerance,
  usesKnownUnpaved,
} from "./constraints";
import { curvyRankScore } from "./curvy";
import {
  preferAvoidingHighways,
  usesHighway,
  withHighwayAvoidanceSignal,
} from "./highways";
import { measureRepeatedRoadPercent } from "./overlap";
import { scenicRankScore } from "./scenic";
import {
  excludeKnownUnpaved,
  withUnknownSurfaceSignal,
} from "./surfaces";
import { touringRankScore } from "./touring";
import type { LoopCandidate, RideStyle } from "./types";

export type LoopWaypointSet = {
  bearingDeg: number;
  radiusKm: number;
  waypoints: Coordinates[];
};

type LoopSeedVertex = {
  bearingOffsetDeg: number;
  radiusFactor: number;
};

type LoopSeedPattern = {
  /** Leaves room for real roads to be longer than straight seed segments. */
  perimeterScale: number;
  vertices: readonly LoopSeedVertex[];
};

const LOOP_ORIENTATIONS_DEG = [22.5, 112.5, 202.5, 292.5] as const;
const EXTRA_CANADA_ORIENTATIONS_DEG = [
  0, 45, 90, 135, 180, 225, 270, 315,
] as const;
const LOOP_SEED_PATTERNS: readonly LoopSeedPattern[] = [
  {
    perimeterScale: 0.72,
    vertices: [
      { bearingOffsetDeg: 0, radiusFactor: 1 },
      { bearingOffsetDeg: 38, radiusFactor: 1.16 },
      { bearingOffsetDeg: 88, radiusFactor: 0.78 },
      { bearingOffsetDeg: 132, radiusFactor: 0.92 },
    ],
  },
  {
    perimeterScale: 0.84,
    vertices: [
      { bearingOffsetDeg: 0, radiusFactor: 0.88 },
      { bearingOffsetDeg: 73, radiusFactor: 1.12 },
    ],
  },
] as const;

/**
 * FR-001 — candidate waypoint rings around the start.
 * The geometric ring is only a seed; the routing provider must snap it to roads.
 * FR-028 — when stayInCanada is on, drop seeds that land in the United States.
 */
export function createLoopWaypointSets(
  start: Coordinates,
  targetDistanceKm: number,
  stayInCanada = false,
): LoopWaypointSet[] {
  const sets = waypointSetsForOrientations(
    start,
    targetDistanceKm,
    LOOP_ORIENTATIONS_DEG,
  );
  if (!stayInCanadaEnabled(stayInCanada)) {
    return sets;
  }

  const canadian = sets.filter(
    (set) => !waypointSetEntersUnitedStates(start, set.waypoints),
  );
  if (canadian.length > 0) {
    return canadian;
  }

  return waypointSetsForOrientations(
    start,
    targetDistanceKm,
    EXTRA_CANADA_ORIENTATIONS_DEG,
  ).filter((set) => !waypointSetEntersUnitedStates(start, set.waypoints));
}

function waypointSetsForOrientations(
  start: Coordinates,
  targetDistanceKm: number,
  orientations: readonly number[],
): LoopWaypointSet[] {
  const sets: LoopWaypointSet[] = [];
  for (const bearingDeg of orientations) {
    for (const pattern of LOOP_SEED_PATTERNS) {
      const seed = createAsymmetricWaypoints(
        start,
        bearingDeg,
        targetDistanceKm,
        pattern,
      );
      sets.push({ bearingDeg, ...seed });
    }
  }
  return sets;
}

function createAsymmetricWaypoints(
  start: Coordinates,
  bearingDeg: number,
  targetDistanceKm: number,
  pattern: LoopSeedPattern,
): Pick<LoopWaypointSet, "radiusKm" | "waypoints"> {
  const perimeterUnits = normalizedPatternPerimeter(pattern.vertices);
  const unitKm = (targetDistanceKm * pattern.perimeterScale) / perimeterUnits;
  const radiiKm = pattern.vertices.map(
    (vertex) => vertex.radiusFactor * unitKm,
  );

  return {
    radiusKm: Math.max(...radiiKm),
    waypoints: pattern.vertices.map((vertex, index) =>
      offsetCoordinates(
        start,
        bearingDeg + vertex.bearingOffsetDeg,
        radiiKm[index] ?? unitKm,
      ),
    ),
  };
}

function normalizedPatternPerimeter(vertices: readonly LoopSeedVertex[]): number {
  const points = [
    { x: 0, y: 0 },
    ...vertices.map((vertex) => {
      const angle = (vertex.bearingOffsetDeg * Math.PI) / 180;
      return {
        x: Math.sin(angle) * vertex.radiusFactor,
        y: Math.cos(angle) * vertex.radiusFactor,
      };
    }),
    { x: 0, y: 0 },
  ];

  let perimeter = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from && to) {
      perimeter += Math.hypot(to.x - from.x, to.y - from.y);
    }
  }
  return perimeter;
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
  touringScore: number;
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
    touringScore: touringRankScore(candidate.geometry, candidate.segments),
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
    }
  | {
      status: "known_unpaved_rejected";
    }
  | {
      status: "canada_only_rejected";
    };

export function selectBestLoopCandidate(
  evaluations: EvaluatedLoopCandidate[],
  targetDistanceKm: number,
  style?: RideStyle,
  avoidHighways = false,
  avoidUnpaved = false,
  stayInCanada = false,
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

  const withoutUnpaved = excludeKnownUnpaved(
    viable,
    (evaluation) => usesKnownUnpaved(evaluation.candidate.segments),
    avoidUnpaved,
  );
  if (avoidUnpaved && viable.length > 0 && withoutUnpaved.length === 0) {
    return { status: "known_unpaved_rejected" };
  }
  const withoutUnitedStates = excludeUnitedStatesCrossing(
    withoutUnpaved,
    (evaluation) => routeEntersUnitedStates(evaluation.candidate),
    stayInCanada,
  );
  if (
    stayInCanada &&
    withoutUnpaved.length > 0 &&
    withoutUnitedStates.length === 0
  ) {
    return { status: "canada_only_rejected" };
  }
  const inTolerance = withoutUnitedStates.filter(
    (evaluation) => evaluation.withinDistanceTolerance,
  );
  const pool = preferAvoidingHighways(
    inTolerance.length > 0 ? inTolerance : withoutUnitedStates,
    (evaluation) => usesHighway(evaluation.candidate.segments),
    avoidHighways,
  );

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

  return {
    status: "selected",
    evaluation: withUnknownSurfaceSignal(
      withHighwayAvoidanceSignal(best, avoidHighways),
    ),
  };
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
  if (style === "touring") {
    return evaluation.touringScore;
  }
  if (style === "fastest") {
    return -evaluation.candidate.durationMinutes;
  }
  return null;
}
