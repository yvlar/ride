import { lineStringLengthKm } from "@/domain/geo/distance";
import type { LineString } from "@/domain/geo/types";
import {
  TOURING_FLUIDITY_SPREAD_PER_KM,
  TOURING_HIGHWAY_ROAD_CLASSES,
  TOURING_SECONDARY_ROAD_CLASSES,
  TOURING_TARGET_HEADING_CHANGE_PER_KM,
  TOURING_WEIGHT_COMFORT,
  TOURING_WEIGHT_FLUIDITY,
  TOURING_WEIGHT_HIGHWAY_AVOIDANCE,
  TOURING_WEIGHT_SECONDARY,
} from "./constants";
import { measureCurvySignals } from "./curvy";
import type { RouteSegment } from "./types";

const HIGHWAY_CLASS_SET = new Set<string>(TOURING_HIGHWAY_ROAD_CLASSES);
const SECONDARY_CLASS_SET = new Set<string>(TOURING_SECONDARY_ROAD_CLASSES);

export type TouringSignals = {
  headingChangePerKm: number;
  significantTurnsPerKm: number;
  reversalCountPerKm: number;
  longestStraightShare: number;
  secondaryRoadPercent: number;
  highwayPercent: number;
  pavedPercent: number;
  unpavedPercent: number;
  unknownSurfacePercent: number;
};

export type TouringScoreBreakdown = {
  fluidity: number;
  secondaryRoads: number;
  comfort: number;
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

/** FR-006 — measurable Touring signals from geometry and provider-agnostic segments. */
export function measureTouringSignals(
  geometry: LineString,
  segments: RouteSegment[] = [],
): TouringSignals {
  const curvy = measureCurvySignals(geometry, segments);
  const total =
    segments.reduce((sum, segment) => sum + segment.distanceKm, 0) ||
    lineStringLengthKm(geometry);

  return {
    headingChangePerKm: curvy.headingChangePerKm,
    significantTurnsPerKm: curvy.significantTurnsPerKm,
    reversalCountPerKm: curvy.reversalCountPerKm,
    longestStraightShare: curvy.longestStraightShare,
    secondaryRoadPercent: distanceShare(segments, (segment) =>
      isSecondaryClass(segment.roadClass),
    ),
    highwayPercent: distanceShare(segments, (segment) =>
      isHighwayClass(segment.roadClass),
    ),
    pavedPercent: distanceShare(segments, (segment) => segment.surface === "paved"),
    unpavedPercent: distanceShare(
      segments,
      (segment) => segment.surface === "unpaved",
    ),
    unknownSurfacePercent:
      total <= 0
        ? 0
        : 100 - distanceShare(segments, (segment) => segment.surface !== undefined),
  };
}

/**
 * FR-006 — fluid, stable riding. Peaks at a moderate heading change and
 * penalizes technical reversals. Duration is never an input (BR-003).
 */
export function fluidityScore(signals: TouringSignals): number {
  const deviation = Math.abs(
    signals.headingChangePerKm - TOURING_TARGET_HEADING_CHANGE_PER_KM,
  );
  const proximity = clampScore(
    (1 - deviation / TOURING_FLUIDITY_SPREAD_PER_KM) * 100,
  );
  const reversalPenalty = Math.min(40, signals.reversalCountPerKm * 25);
  return clampScore(proximity - reversalPenalty);
}

export function touringSecondaryRoadsScore(signals: TouringSignals): number {
  return clampScore(signals.secondaryRoadPercent);
}

/**
 * FR-006 — comfortable / good-quality pavement. Unknown surface stays 0;
 * the scorer does not invent a paved ride.
 */
export function comfortScore(signals: TouringSignals): number {
  return clampScore(signals.pavedPercent - signals.unpavedPercent * 0.5);
}

export function touringHighwayAvoidanceScore(signals: TouringSignals): number {
  return clampScore(100 - signals.highwayPercent * 2);
}

/** FR-006 / BR-003 — Touring rank; duration and fastest-path time are never inputs. */
export function scoreTouringBreakdown(
  geometry: LineString,
  segments: RouteSegment[] = [],
): TouringScoreBreakdown {
  const signals = measureTouringSignals(geometry, segments);
  const fluidity = fluidityScore(signals);
  const secondaryRoads = touringSecondaryRoadsScore(signals);
  const comfort = comfortScore(signals);
  const highwayAvoidance = touringHighwayAvoidanceScore(signals);
  const total =
    TOURING_WEIGHT_FLUIDITY * fluidity +
    TOURING_WEIGHT_SECONDARY * secondaryRoads +
    TOURING_WEIGHT_COMFORT * comfort +
    TOURING_WEIGHT_HIGHWAY_AVOIDANCE * highwayAvoidance;

  return {
    fluidity,
    secondaryRoads,
    comfort,
    highwayAvoidance,
    total,
  };
}

export function touringRankScore(
  geometry: LineString,
  segments: RouteSegment[] = [],
): number {
  return scoreTouringBreakdown(geometry, segments).total;
}
