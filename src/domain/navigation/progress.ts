import {
  initialBearingDeg,
  lineStringLengthKm,
  positionToCoordinates,
} from "@/domain/geo/distance";
import { nearestPointOnLine } from "@/domain/geo/nearest-point";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  LOW_ACCURACY_LIMIT_M,
  OFF_ROUTE_MIN_THRESHOLD_M,
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
): number {
  if (previousKm === null) {
    return measuredKm;
  }
  if (measuredKm >= previousKm) {
    return measuredKm;
  }
  const dropM = (previousKm - measuredKm) * 1_000;
  return dropM <= hysteresisM ? previousKm : measuredKm;
}

export function projectOnRoute(
  point: Coordinates,
  geometry: LineString,
  previousProgressKm: number | null = null,
  options: {
    headingDeg?: number | null;
    gapBeforeVertex?: ReadonlySet<number>;
  } = {},
): RouteProjection | null {
  const nearest = nearestPointOnLine(point, geometry, {
    previousProgressKm: previousProgressKm ?? 0,
    headingDeg: options.headingDeg,
    gapBeforeVertex: options.gapBeforeVertex,
    progressPenaltyMPerKm: PROGRESS_MATCH_PENALTY_M_PER_KM,
  });
  if (!nearest) {
    return null;
  }

  return {
    snapped: nearest.point,
    distanceToRouteM: nearest.distanceM,
    progressKm: nearest.progressKm,
    remainingDistanceKm: nearest.remainingDistanceKm,
    remainingDurationMinutes: 0,
    segmentIndex: nearest.segmentIndex,
    segmentFraction: nearest.t,
  };
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
  headingDeg?: number | null;
  gapBeforeVertex?: ReadonlySet<number>;
}): NavigationProgress | null {
  const lowAccuracy = !isAccuracyUsable(input.fix.accuracyMeters);
  const projection = projectOnRoute(
    input.fix.coordinates,
    input.geometry,
    input.previousProgressKm,
    {
      headingDeg: input.headingDeg ?? input.fix.headingDeg,
      gapBeforeVertex: input.gapBeforeVertex,
    },
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

/**
 * Map / CarPlay puck: keep the rider on the traced route while GPS is usable
 * and still on the corridor (FR-024).
 */
export function navigationDisplayLocation(input: {
  fix: Coordinates;
  progress: NavigationProgress | null;
}): Coordinates {
  if (!input.progress || input.progress.lowAccuracy) {
    return input.fix;
  }
  if (input.progress.projection.distanceToRouteM > OFF_ROUTE_MIN_THRESHOLD_M) {
    return input.fix;
  }
  return input.progress.projection.snapped;
}

/**
 * Prefer GPS heading, otherwise the bearing of the active route segment so
 * the camera can follow the trace (FR-024, FR-028).
 */
export function navigationDisplayHeading(input: {
  gpsHeadingDeg: number | null | undefined;
  geometry: LineString;
  segmentIndex: number | null | undefined;
}): number | null {
  const gps = input.gpsHeadingDeg;
  if (typeof gps === "number" && Number.isFinite(gps)) {
    return ((gps % 360) + 360) % 360;
  }
  if (input.segmentIndex == null || input.segmentIndex < 0) {
    return null;
  }
  const from = input.geometry.coordinates[input.segmentIndex];
  const to = input.geometry.coordinates[input.segmentIndex + 1];
  if (!from || !to) {
    return null;
  }
  return initialBearingDeg(
    positionToCoordinates(from),
    positionToCoordinates(to),
  );
}
