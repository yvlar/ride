import { lineStringLengthKm } from "@/domain/geo/distance";
import type { LineString } from "@/domain/geo/types";
import {
  SCENIC_HIGHWAY_ROAD_CLASSES,
  SCENIC_INDUSTRIAL_ROAD_CLASSES,
  SCENIC_MOUNTAIN_M_PER_KM_FOR_MAX,
  SCENIC_RURAL_ROAD_CLASSES,
  SCENIC_WEIGHT_AVOIDANCE,
  SCENIC_WEIGHT_CURVES,
  SCENIC_WEIGHT_LANDSCAPE,
  SCENIC_WEIGHT_RURAL,
} from "./constants";
import { curvesScore, measureCurvySignals } from "./curvy";
import type {
  RouteSegment,
  ScenicLandscapeFeature,
} from "./types";

const HIGHWAY_CLASS_SET = new Set<string>(SCENIC_HIGHWAY_ROAD_CLASSES);
const RURAL_CLASS_SET = new Set<string>(SCENIC_RURAL_ROAD_CLASSES);
const INDUSTRIAL_CLASS_SET = new Set<string>(SCENIC_INDUSTRIAL_ROAD_CLASSES);
const WATER_FEATURES = new Set<ScenicLandscapeFeature>(["lake", "river"]);

export type ScenicSignals = {
  ruralRoadPercent: number;
  highwayPercent: number;
  industrialPercent: number;
  waterPercent: number;
  mountainPercent: number;
  viewpointPercent: number;
  villagePercent: number;
  panoramicPercent: number;
  elevationGainMPerKm: number | null;
  hasKnownLandscape: boolean;
};

export type ScenicScoreBreakdown = {
  landscape: number;
  ruralRoads: number;
  curves: number;
  avoidance: number;
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

function featuresOf(segment: RouteSegment): Set<ScenicLandscapeFeature> {
  return new Set(segment.landscapeFeatures ?? []);
}

function hasFeature(
  segment: RouteSegment,
  feature: ScenicLandscapeFeature,
): boolean {
  return featuresOf(segment).has(feature);
}

function isRuralSegment(segment: RouteSegment): boolean {
  return (
    hasFeature(segment, "rural") ||
    RURAL_CLASS_SET.has(normalizeRoadClass(segment.roadClass))
  );
}

function isHighwaySegment(segment: RouteSegment): boolean {
  return HIGHWAY_CLASS_SET.has(normalizeRoadClass(segment.roadClass));
}

function isIndustrialSegment(segment: RouteSegment): boolean {
  return (
    hasFeature(segment, "industrial") ||
    INDUSTRIAL_CLASS_SET.has(normalizeRoadClass(segment.roadClass))
  );
}

function isWaterSegment(segment: RouteSegment): boolean {
  return [...featuresOf(segment)].some((feature) => WATER_FEATURES.has(feature));
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

function mountainPercentFromElevation(
  elevationGainMPerKm: number | null,
): number {
  if (elevationGainMPerKm === null) {
    return 0;
  }

  return clampScore(
    (elevationGainMPerKm / SCENIC_MOUNTAIN_M_PER_KM_FOR_MAX) * 100,
  );
}

/** FR-005 — approximate scenic signals. Unknown tags stay unknown. */
export function measureScenicSignals(
  geometry: LineString,
  segments: RouteSegment[] = [],
): ScenicSignals {
  const distanceKm =
    segments.reduce((sum, segment) => sum + segment.distanceKm, 0) ||
    lineStringLengthKm(geometry);
  const elevationGainMPerKm = measureElevationGainMPerKm(segments, distanceKm);
  const taggedMountainPercent = distanceShare(segments, (segment) =>
    hasFeature(segment, "mountain"),
  );
  const waterPercent = distanceShare(segments, isWaterSegment);
  const viewpointPercent = distanceShare(segments, (segment) =>
    hasFeature(segment, "viewpoint"),
  );
  const villagePercent = distanceShare(segments, (segment) =>
    hasFeature(segment, "village"),
  );
  const panoramicPercent = distanceShare(segments, (segment) =>
    hasFeature(segment, "panoramic"),
  );

  return {
    ruralRoadPercent: distanceShare(segments, isRuralSegment),
    highwayPercent: distanceShare(segments, isHighwaySegment),
    industrialPercent: distanceShare(segments, isIndustrialSegment),
    waterPercent,
    mountainPercent: Math.max(
      taggedMountainPercent,
      mountainPercentFromElevation(elevationGainMPerKm),
    ),
    viewpointPercent,
    villagePercent,
    panoramicPercent,
    elevationGainMPerKm,
    hasKnownLandscape:
      waterPercent > 0 ||
      taggedMountainPercent > 0 ||
      elevationGainMPerKm !== null ||
      viewpointPercent > 0 ||
      villagePercent > 0 ||
      panoramicPercent > 0,
  };
}

/**
 * FR-005 — heuristic landscape rank. Do not present this as a precise
 * panoramic measurement.
 */
export function landscapeScore(signals: ScenicSignals): number {
  return clampScore(
    signals.waterPercent * 0.25 +
      signals.mountainPercent * 0.25 +
      signals.viewpointPercent * 0.15 +
      signals.villagePercent * 0.15 +
      signals.panoramicPercent * 0.2,
  );
}

export function ruralRoadsScore(signals: ScenicSignals): number {
  return clampScore(signals.ruralRoadPercent);
}

export function scenicAvoidanceScore(signals: ScenicSignals): number {
  return clampScore(
    100 - signals.highwayPercent * 2 - signals.industrialPercent * 1.5,
  );
}

/** FR-005 / BR-003 — Scenic rank; duration and fastest-path time are never inputs. */
export function scoreScenicBreakdown(
  geometry: LineString,
  segments: RouteSegment[] = [],
): ScenicScoreBreakdown {
  const signals = measureScenicSignals(geometry, segments);
  const landscape = landscapeScore(signals);
  const ruralRoads = ruralRoadsScore(signals);
  const curves = curvesScore(measureCurvySignals(geometry, segments));
  const avoidance = scenicAvoidanceScore(signals);
  const total =
    SCENIC_WEIGHT_LANDSCAPE * landscape +
    SCENIC_WEIGHT_RURAL * ruralRoads +
    SCENIC_WEIGHT_CURVES * curves +
    SCENIC_WEIGHT_AVOIDANCE * avoidance;

  return {
    landscape,
    ruralRoads,
    curves,
    avoidance,
    total,
  };
}

export function scenicRankScore(
  geometry: LineString,
  segments: RouteSegment[] = [],
): number {
  return scoreScenicBreakdown(geometry, segments).total;
}
