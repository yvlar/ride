import {
  haversineKm,
  lineStringLengthKm,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  LOW_ACCURACY_LIMIT_M,
  PROGRESS_FORWARD_MAX_M,
  PROGRESS_HYSTERESIS_M,
  PROGRESS_MATCH_PENALTY_M_PER_KM,
} from "./constants";
import type {
  LocationFix,
  NavigationProgress,
  NavigationStep,
  RouteProjection,
} from "./types";

export function isAccuracyUsable(accuracyMeters: number): boolean {
  return Number.isFinite(accuracyMeters) && accuracyMeters <= LOW_ACCURACY_LIMIT_M;
}

export function stabilizeProgressKm(
  previousKm: number | null,
  measuredKm: number,
  hysteresisM = PROGRESS_HYSTERESIS_M,
  forwardMaxM = PROGRESS_FORWARD_MAX_M,
): number {
  if (previousKm === null) {
    return measuredKm;
  }
  if (measuredKm >= previousKm) {
    const jumpM = (measuredKm - previousKm) * 1_000;
    return jumpM <= forwardMaxM ? measuredKm : previousKm;
  }
  const dropM = (previousKm - measuredKm) * 1_000;
  return dropM <= hysteresisM ? previousKm : measuredKm;
}

export function projectOnRoute(
  point: Coordinates,
  geometry: LineString,
  previousProgressKm: number | null = null,
): RouteProjection | null {
  if (geometry.coordinates.length < 2) {
    return null;
  }

  const candidates: RouteProjection[] = [];
  let traveledKm = 0;

  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const from = positionToCoordinates(geometry.coordinates[index - 1]!);
    const to = positionToCoordinates(geometry.coordinates[index]!);
    const segmentKm = haversineKm(from, to);
    const closest = closestPointOnSegment(point, from, to);
    const progressKm = traveledKm + closest.t * segmentKm;
    candidates.push({
      snapped: closest.point,
      distanceToRouteM: closest.distanceKm * 1_000,
      progressKm,
      remainingDistanceKm: 0,
      remainingDurationMinutes: 0,
      segmentIndex: index - 1,
    });
    traveledKm += segmentKm;
  }

  const targetProgressKm = previousProgressKm ?? 0;
  const best = candidates.reduce<RouteProjection | null>((current, candidate) => {
    if (!current) {
      return candidate;
    }
    return projectionScore(candidate, targetProgressKm) <
      projectionScore(current, targetProgressKm)
      ? candidate
      : current;
  }, null);

  if (!best) {
    return null;
  }

  return {
    ...best,
    remainingDistanceKm: Math.max(0, traveledKm - best.progressKm),
  };
}

function projectionScore(
  candidate: RouteProjection,
  targetProgressKm: number,
): number {
  return (
    candidate.distanceToRouteM +
    PROGRESS_MATCH_PENALTY_M_PER_KM *
      Math.abs(candidate.progressKm - targetProgressKm)
  );
}

export function remainingAlongRoute(
  progressKm: number,
  totalDistanceKm: number,
  totalDurationMinutes: number,
): { remainingDistanceKm: number; remainingDurationMinutes: number } {
  const remainingDistanceKm = Math.max(0, totalDistanceKm - progressKm);
  const fraction =
    totalDistanceKm > 0 ? remainingDistanceKm / totalDistanceKm : 0;
  return {
    remainingDistanceKm,
    remainingDurationMinutes: Math.max(0, totalDurationMinutes * fraction),
  };
}

export function stepStartProgressKm(steps: NavigationStep[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const step of steps) {
    starts.push(acc);
    acc += step.distanceKm;
  }
  return starts;
}

export function selectNextStep(
  steps: NavigationStep[],
  progressKm: number,
  hysteresisM = PROGRESS_HYSTERESIS_M,
): { currentStepIndex: number; nextStep: NavigationStep | null } {
  if (steps.length === 0) {
    return { currentStepIndex: -1, nextStep: null };
  }

  const starts = stepStartProgressKm(steps);
  const hysteresisKm = hysteresisM / 1_000;
  for (let index = 0; index < steps.length; index += 1) {
    const start = starts[index] ?? 0;
    if (progressKm < start + hysteresisKm) {
      return {
        currentStepIndex: Math.max(0, index - 1),
        nextStep: steps[index]!,
      };
    }
  }

  return {
    currentStepIndex: steps.length - 1,
    nextStep: steps[steps.length - 1]!,
  };
}

export function distanceToNextManeuverM(
  steps: NavigationStep[],
  progressKm: number,
  nextStep: NavigationStep | null,
): number {
  if (!nextStep) {
    return 0;
  }
  const starts = stepStartProgressKm(steps);
  const nextIndex = steps.indexOf(nextStep);
  const start = starts[nextIndex] ?? lineStringLengthKm(nextStep.geometry);
  return Math.max(0, (start - progressKm) * 1_000);
}

export function evaluateNavigationProgress(input: {
  fix: LocationFix;
  geometry: LineString;
  steps: NavigationStep[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  previousProgressKm: number | null;
}): NavigationProgress | null {
  const lowAccuracy = !isAccuracyUsable(input.fix.accuracyMeters);
  const projection = projectOnRoute(
    input.fix.coordinates,
    input.geometry,
    input.previousProgressKm,
  );
  if (!projection) {
    return null;
  }

  const progressKm = lowAccuracy
    ? (input.previousProgressKm ?? projection.progressKm)
    : stabilizeProgressKm(input.previousProgressKm, projection.progressKm);

  const remaining = remainingAlongRoute(
    progressKm,
    input.totalDistanceKm,
    input.totalDurationMinutes,
  );
  const { currentStepIndex, nextStep } = lowAccuracy
    ? selectNextStep(input.steps, input.previousProgressKm ?? progressKm)
    : selectNextStep(input.steps, progressKm);

  return {
    projection: {
      ...projection,
      progressKm,
      remainingDistanceKm: remaining.remainingDistanceKm,
      remainingDurationMinutes: remaining.remainingDurationMinutes,
    },
    currentStepIndex,
    nextStep,
    distanceToNextManeuverM: lowAccuracy
      ? Number.POSITIVE_INFINITY
      : distanceToNextManeuverM(input.steps, progressKm, nextStep),
    remainingDistanceKm: remaining.remainingDistanceKm,
    remainingDurationMinutes: remaining.remainingDurationMinutes,
    lowAccuracy,
  };
}

function closestPointOnSegment(
  point: Coordinates,
  from: Coordinates,
  to: Coordinates,
): { point: Coordinates; t: number; distanceKm: number } {
  const origin = from;
  const p = toLocalKm(origin, point);
  const a = toLocalKm(origin, from);
  const b = toLocalKm(origin, to);
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

function toLocalKm(origin: Coordinates, point: Coordinates): { x: number; y: number } {
  const meanLat = ((origin.latitude + point.latitude) / 2) * (Math.PI / 180);
  return {
    x:
      (point.longitude - origin.longitude) *
      111.32 *
      Math.cos(meanLat),
    y: (point.latitude - origin.latitude) * 111.32,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
