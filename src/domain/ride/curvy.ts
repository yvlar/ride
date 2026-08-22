import {
  haversineKm,
  initialBearingDeg,
  lineStringLengthKm,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { LineString } from "@/domain/geo/types";
import {
  CURVY_ELEVATION_M_PER_KM_FOR_MAX,
  CURVY_HEADING_CHANGE_PER_KM_FOR_MAX,
  CURVY_HIGHWAY_ROAD_CLASSES,
  CURVY_REVERSAL_DEG,
  CURVY_SECONDARY_ROAD_CLASSES,
  CURVY_SIGNIFICANT_TURN_DEG,
  CURVY_STRAIGHT_HEADING_DEG,
  CURVY_STRAIGHT_SCORE_WEIGHT,
  CURVY_TURNS_PER_KM_FOR_MAX,
  CURVY_UNKNOWN_ELEVATION_SCORE,
  CURVY_WEIGHT_CURVES,
  CURVY_WEIGHT_ELEVATION,
  CURVY_WEIGHT_HIGHWAY_AVOIDANCE,
  CURVY_WEIGHT_SECONDARY,
} from "./constants";
import type { RouteSegment } from "./types";

const HIGHWAY_CLASS_SET = new Set<string>(CURVY_HIGHWAY_ROAD_CLASSES);
const SECONDARY_CLASS_SET = new Set<string>(CURVY_SECONDARY_ROAD_CLASSES);

export type CurvySignals = {
  headingChangePerKm: number;
  significantTurnsPerKm: number;
  reversalCountPerKm: number;
  longestStraightShare: number;
  secondaryRoadPercent: number;
  highwayPercent: number;
  elevationGainMPerKm: number | null;
};

export type CurvyScoreBreakdown = {
  curves: number;
  secondaryRoads: number;
  elevation: number;
  highwayAvoidance: number;
  total: number;
};

function clampScore(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
}

function headingDeltaDeg(fromBearing: number, toBearing: number): number {
  const raw = Math.abs(toBearing - fromBearing) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function normalizeRoadClass(roadClass?: string): string {
  return roadClass?.trim().toLowerCase() ?? "";
}

function isHighwayClass(roadClass?: string): boolean {
  return HIGHWAY_CLASS_SET.has(normalizeRoadClass(roadClass));
}

function isSecondaryClass(roadClass?: string): boolean {
  return SECONDARY_CLASS_SET.has(normalizeRoadClass(roadClass));
}

function distanceShare(
  segments: RouteSegment[],
  predicate: (segment: RouteSegment) => boolean,
): number {
  const total = segments.reduce((sum, segment) => sum + segment.distanceKm, 0);
  if (total <= 0) {
    return 0;
  }

  const matched = segments
    .filter(predicate)
    .reduce((sum, segment) => sum + segment.distanceKm, 0);
  return (matched / total) * 100;
}

function measureGeometrySignals(geometry: LineString): {
  headingChangePerKm: number;
  significantTurnsPerKm: number;
  reversalCountPerKm: number;
  longestStraightShare: number;
} {
  const lengthKm = lineStringLengthKm(geometry);
  if (lengthKm === 0 || geometry.coordinates.length < 2) {
    return {
      headingChangePerKm: 0,
      significantTurnsPerKm: 0,
      reversalCountPerKm: 0,
      longestStraightShare: 1,
    };
  }

  const edgeLengthsKm: number[] = [];
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    edgeLengthsKm.push(
      haversineKm(
        positionToCoordinates(geometry.coordinates[index - 1]),
        positionToCoordinates(geometry.coordinates[index]),
      ),
    );
  }

  const headingChangesDeg: number[] = [];
  for (let index = 1; index < geometry.coordinates.length - 1; index += 1) {
    const previous = positionToCoordinates(geometry.coordinates[index - 1]);
    const current = positionToCoordinates(geometry.coordinates[index]);
    const next = positionToCoordinates(geometry.coordinates[index + 1]);
    headingChangesDeg.push(
      headingDeltaDeg(
        initialBearingDeg(previous, current),
        initialBearingDeg(current, next),
      ),
    );
  }

  let significantTurns = 0;
  let reversals = 0;
  for (const change of headingChangesDeg) {
    if (change >= CURVY_REVERSAL_DEG) {
      reversals += 1;
    } else if (change >= CURVY_SIGNIFICANT_TURN_DEG) {
      significantTurns += 1;
    }
  }

  let currentStraightKm = edgeLengthsKm[0] ?? 0;
  let longestStraightKm = currentStraightKm;
  for (let index = 1; index < edgeLengthsKm.length; index += 1) {
    const change = headingChangesDeg[index - 1] ?? 0;
    const edgeKm = edgeLengthsKm[index] ?? 0;
    if (change < CURVY_STRAIGHT_HEADING_DEG) {
      currentStraightKm += edgeKm;
    } else {
      currentStraightKm = edgeKm;
    }
    longestStraightKm = Math.max(longestStraightKm, currentStraightKm);
  }

  return {
    headingChangePerKm: headingChangesDeg.reduce((sum, change) => sum + change, 0) / lengthKm,
    significantTurnsPerKm: significantTurns / lengthKm,
    reversalCountPerKm: reversals / lengthKm,
    longestStraightShare: longestStraightKm / lengthKm,
  };
}

function measureElevationGainMPerKm(
  segments: RouteSegment[],
  distanceKm: number,
): number | null {
  const hasElevation = segments.some(
    (segment) => segment.elevationGainM !== undefined,
  );
  if (!hasElevation || distanceKm <= 0) {
    return null;
  }

  const gainM = segments.reduce(
    (sum, segment) => sum + (segment.elevationGainM ?? 0),
    0,
  );
  return gainM / distanceKm;
}

/** FR-004 — measurable Curvy signals from geometry and provider-agnostic segments. */
export function measureCurvySignals(
  geometry: LineString,
  segments: RouteSegment[] = [],
): CurvySignals {
  const distanceKm =
    segments.reduce((sum, segment) => sum + segment.distanceKm, 0) ||
    lineStringLengthKm(geometry);
  const geometrySignals = measureGeometrySignals(geometry);

  return {
    ...geometrySignals,
    secondaryRoadPercent: distanceShare(segments, (segment) =>
      isSecondaryClass(segment.roadClass),
    ),
    highwayPercent: distanceShare(segments, (segment) =>
      isHighwayClass(segment.roadClass),
    ),
    elevationGainMPerKm: measureElevationGainMPerKm(segments, distanceKm),
  };
}

export function curvesScore(signals: CurvySignals): number {
  const heading = clampScore(
    (signals.headingChangePerKm / CURVY_HEADING_CHANGE_PER_KM_FOR_MAX) * 100,
  );
  const turns = clampScore(
    (signals.significantTurnsPerKm / CURVY_TURNS_PER_KM_FOR_MAX) * 100,
  );
  const twist = heading * 0.7 + turns * 0.3;
  const straightFactor = 1 - CURVY_STRAIGHT_SCORE_WEIGHT * signals.longestStraightShare;
  const reversalPenalty = Math.min(20, signals.reversalCountPerKm * 15);
  return clampScore(twist * straightFactor - reversalPenalty);
}

export function secondaryRoadsScore(signals: CurvySignals): number {
  return clampScore(signals.secondaryRoadPercent);
}

export function elevationScore(signals: CurvySignals): number {
  if (signals.elevationGainMPerKm === null) {
    return CURVY_UNKNOWN_ELEVATION_SCORE;
  }

  return clampScore(
    (signals.elevationGainMPerKm / CURVY_ELEVATION_M_PER_KM_FOR_MAX) * 100,
  );
}

export function highwayAvoidanceScore(signals: CurvySignals): number {
  return clampScore(100 - signals.highwayPercent * 2);
}

/** FR-004 / BR-003 — Curvy rank; duration and fastest-path time are never inputs. */
export function scoreCurvyBreakdown(signals: CurvySignals): CurvyScoreBreakdown {
  const curves = curvesScore(signals);
  const secondaryRoads = secondaryRoadsScore(signals);
  const elevation = elevationScore(signals);
  const highwayAvoidance = highwayAvoidanceScore(signals);
  const total =
    CURVY_WEIGHT_CURVES * curves +
    CURVY_WEIGHT_SECONDARY * secondaryRoads +
    CURVY_WEIGHT_ELEVATION * elevation +
    CURVY_WEIGHT_HIGHWAY_AVOIDANCE * highwayAvoidance;

  return {
    curves,
    secondaryRoads,
    elevation,
    highwayAvoidance,
    total,
  };
}

export function curvyRankScore(
  geometry: LineString,
  segments: RouteSegment[] = [],
): number {
  return scoreCurvyBreakdown(measureCurvySignals(geometry, segments)).total;
}
