import {
  haversineKm,
  lineStringLengthKm,
  positionToCoordinates,
} from "@/domain/geo/distance";
import { joinLineStrings } from "@/domain/geo/geometry";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  HIGHWAY_AVOIDANCE_WARNING,
  usesHighway,
} from "@/domain/ride/highways";
import { UNKNOWN_SURFACE_WARNING, usesUnknownSurface } from "@/domain/ride/surfaces";
import type { GeneratedRideRoute, RouteSegment } from "@/domain/ride/types";
import { REJOIN_AHEAD_FRACTION, REJOIN_AHEAD_MIN_KM } from "./constants";
import type { NavigationStep } from "./types";

export function pointAlongLine(
  geometry: LineString,
  distanceKm: number,
): Coordinates | null {
  if (geometry.coordinates.length === 0) {
    return null;
  }
  if (geometry.coordinates.length === 1 || distanceKm <= 0) {
    return positionToCoordinates(geometry.coordinates[0]!);
  }

  let remaining = distanceKm;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const from = positionToCoordinates(geometry.coordinates[index - 1]!);
    const to = positionToCoordinates(geometry.coordinates[index]!);
    const segmentKm = haversineKm(from, to);
    if (remaining <= segmentKm) {
      const t = segmentKm === 0 ? 0 : remaining / segmentKm;
      return {
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      };
    }
    remaining -= segmentKm;
  }

  return positionToCoordinates(
    geometry.coordinates[geometry.coordinates.length - 1]!,
  );
}

export function splitLineAtDistance(
  geometry: LineString,
  distanceKm: number,
): { before: LineString; after: LineString } {
  const split = pointAlongLine(geometry, distanceKm);
  if (!split) {
    const empty: LineString = { type: "LineString", coordinates: [] };
    return { before: empty, after: empty };
  }

  const before: LineString["coordinates"] = [];
  const after: LineString["coordinates"] = [];
  let traveled = 0;
  let passed = false;

  before.push(geometry.coordinates[0]!);
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const from = positionToCoordinates(geometry.coordinates[index - 1]!);
    const to = positionToCoordinates(geometry.coordinates[index]!);
    const segmentKm = haversineKm(from, to);
    if (!passed && traveled + segmentKm >= distanceKm) {
      const splitPosition: [number, number] = [split.longitude, split.latitude];
      before.push(splitPosition);
      after.push(splitPosition);
      after.push(geometry.coordinates[index]!);
      passed = true;
    } else if (passed) {
      after.push(geometry.coordinates[index]!);
    } else {
      before.push(geometry.coordinates[index]!);
    }
    traveled += segmentKm;
  }

  if (!passed) {
    return {
      before: geometry,
      after: {
        type: "LineString",
        coordinates: [geometry.coordinates[geometry.coordinates.length - 1]!],
      },
    };
  }

  return {
    before: { type: "LineString", coordinates: dedupeConsecutive(before) },
    after: { type: "LineString", coordinates: dedupeConsecutive(after) },
  };
}

export function selectRejoinDistanceKm(remainingDistanceKm: number): number {
  if (remainingDistanceKm <= 0) {
    return 0;
  }
  return Math.min(
    remainingDistanceKm,
    Math.max(REJOIN_AHEAD_MIN_KM, remainingDistanceKm * REJOIN_AHEAD_FRACTION),
  );
}

export function remainingGeometryFromProgress(
  geometry: LineString,
  progressKm: number,
): LineString {
  return splitLineAtDistance(geometry, progressKm).after;
}

export function remainingStepsFromProgress(
  steps: NavigationStep[],
  progressKm: number,
): NavigationStep[] {
  let acc = 0;
  const remaining: NavigationStep[] = [];
  for (const step of steps) {
    const start = acc;
    acc += step.distanceKm;
    if (acc > progressKm && step.maneuverType !== "depart") {
      remaining.push({
        ...step,
        distanceKm: start < progressKm ? acc - progressKm : step.distanceKm,
      });
    }
  }
  return remaining;
}

export function concatNavigationSteps(
  first: NavigationStep[],
  second: NavigationStep[],
): NavigationStep[] {
  const trimmedFirst =
    first.at(-1)?.maneuverType === "arrive" ? first.slice(0, -1) : first;
  const trimmedSecond =
    second[0]?.maneuverType === "depart" ? second.slice(1) : second;
  return [...trimmedFirst, ...trimmedSecond].map((step, index) => ({
    ...step,
    id: `step:${index}:${step.maneuverType}`,
  }));
}

export function mergeRecalculatedRoute(input: {
  original: GeneratedRideRoute;
  connectorGeometry: LineString;
  connectorSegments: RouteSegment[];
  connectorSteps: NavigationStep[];
  connectorDistanceKm: number;
  connectorDurationMinutes: number;
  remainingGeometry: LineString;
  remainingSegments: RouteSegment[];
  remainingSteps: NavigationStep[];
  remainingDistanceKm: number;
  remainingDurationMinutes: number;
  avoidHighways: boolean;
}): GeneratedRideRoute {
  const geometry = joinLineStrings(input.connectorGeometry, input.remainingGeometry);
  const segments = [
    ...input.connectorSegments,
    ...input.remainingSegments,
  ];
  const steps = concatNavigationSteps(
    input.connectorSteps,
    input.remainingSteps,
  );
  const distanceKm = lineStringLengthKm(geometry);
  const durationMinutes =
    input.connectorDurationMinutes + input.remainingDurationMinutes;
  const warnings = mergeWarnings(
    input.original.warnings,
    segments,
    input.avoidHighways,
  );

  return {
    ...input.original,
    id: input.original.id,
    geometry,
    segments,
    steps,
    distanceKm,
    durationMinutes,
    warnings,
  };
}

export function replaceDestinationRoute(input: {
  original: GeneratedRideRoute;
  geometry: LineString;
  segments: RouteSegment[];
  steps: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
  avoidHighways: boolean;
}): GeneratedRideRoute {
  return {
    ...input.original,
    geometry: input.geometry,
    segments: input.segments,
    steps: input.steps,
    distanceKm: input.distanceKm,
    durationMinutes: input.durationMinutes,
    warnings: mergeWarnings(
      input.original.warnings,
      input.segments,
      input.avoidHighways,
    ),
  };
}

function mergeWarnings(
  previous: string[],
  segments: RouteSegment[],
  avoidHighways: boolean,
): string[] {
  const next = previous.filter((warning) => {
    if (warning === HIGHWAY_AVOIDANCE_WARNING) {
      return avoidHighways && usesHighway(segments);
    }
    if (warning === UNKNOWN_SURFACE_WARNING) {
      return usesUnknownSurface(segments);
    }
    return true;
  });
  if (avoidHighways && usesHighway(segments) && !next.includes(HIGHWAY_AVOIDANCE_WARNING)) {
    next.push(HIGHWAY_AVOIDANCE_WARNING);
  }
  if (usesUnknownSurface(segments) && !next.includes(UNKNOWN_SURFACE_WARNING)) {
    next.push(UNKNOWN_SURFACE_WARNING);
  }
  return next;
}

function dedupeConsecutive(
  coordinates: LineString["coordinates"],
): LineString["coordinates"] {
  const unique: LineString["coordinates"] = [];
  for (const position of coordinates) {
    const last = unique[unique.length - 1];
    if (last && last[0] === position[0] && last[1] === position[1]) {
      continue;
    }
    unique.push(position);
  }
  return unique;
}
