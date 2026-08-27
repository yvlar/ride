import { haversineKm } from "@/domain/geo/distance";
import {
  RECORDING_FIRST_FIX_MAX_ACCURACY_M,
  RECORDING_JUMP_RESYNC_FIXES,
  RECORDING_MAX_ACCURACY_M,
  RECORDING_MAX_SPEED_MPS,
  RECORDING_MIN_MOVE_M,
  RECORDING_NULL_ISLAND_EPSILON,
} from "./constants";
import { recordedPointCoordinates, type RecordedTrackPoint } from "./types";

export type RecordedPointRejection =
  | "invalid-coordinates"
  | "duplicate"
  | "low-accuracy"
  | "stationary"
  | "impossible-jump";

export type RecordedPointDecision =
  | { accepted: true; addedKm: number; resynchronized: boolean }
  | { accepted: false; reason: RecordedPointRejection };

/** FR-041 — coordonnées, horodatage et altitude exploitables. */
export function isValidRecordedPoint(point: RecordedTrackPoint): boolean {
  const { latitude, longitude, timestamp } = point;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(timestamp)
  ) {
    return false;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false;
  }
  if (timestamp <= 0) {
    return false;
  }
  return !isNullIsland(point);
}

function isNullIsland(point: RecordedTrackPoint): boolean {
  return (
    Math.abs(point.latitude) < RECORDING_NULL_ISLAND_EPSILON &&
    Math.abs(point.longitude) < RECORDING_NULL_ISLAND_EPSILON
  );
}

function accuracyOf(point: RecordedTrackPoint): number | null {
  const accuracy = point.accuracy;
  return typeof accuracy === "number" && Number.isFinite(accuracy)
    ? accuracy
    : null;
}

/**
 * FR-041 — décide si un relevé rejoint la trace. Le filtrage est isolé du
 * suivi GPS et de l'état de l'enregistrement pour rester testable.
 */
export function evaluateRecordedPoint(input: {
  candidate: RecordedTrackPoint;
  previous: RecordedTrackPoint | null;
  rejectedJumps?: number;
}): RecordedPointDecision {
  const { candidate, previous } = input;
  const rejectedJumps = input.rejectedJumps ?? 0;

  if (!isValidRecordedPoint(candidate)) {
    return { accepted: false, reason: "invalid-coordinates" };
  }

  const accuracy = accuracyOf(candidate);
  const accuracyLimit = previous
    ? RECORDING_MAX_ACCURACY_M
    : RECORDING_FIRST_FIX_MAX_ACCURACY_M;
  if (accuracy !== null && accuracy > accuracyLimit) {
    return { accepted: false, reason: "low-accuracy" };
  }

  if (!previous) {
    return { accepted: true, addedKm: 0, resynchronized: false };
  }

  if (candidate.timestamp <= previous.timestamp) {
    return { accepted: false, reason: "duplicate" };
  }

  const distanceKm = haversineKm(
    recordedPointCoordinates(previous),
    recordedPointCoordinates(candidate),
  );
  const distanceM = distanceKm * 1_000;
  if (distanceM < RECORDING_MIN_MOVE_M) {
    return { accepted: false, reason: "stationary" };
  }

  const elapsedSeconds = (candidate.timestamp - previous.timestamp) / 1_000;
  const impliedSpeedMps = distanceM / elapsedSeconds;
  if (impliedSpeedMps > RECORDING_MAX_SPEED_MPS) {
    // Un saut isolé est du bruit; un décalage qui persiste est la vraie
    // position et doit reprendre la main (FR-041).
    if (rejectedJumps + 1 < RECORDING_JUMP_RESYNC_FIXES) {
      return { accepted: false, reason: "impossible-jump" };
    }
    return { accepted: true, addedKm: distanceKm, resynchronized: true };
  }

  return { accepted: true, addedKm: distanceKm, resynchronized: false };
}

/** FR-041 — distance du parcours, recalculée depuis les points conservés. */
export function recordedDistanceKm(points: RecordedTrackPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineKm(
      recordedPointCoordinates(points[index - 1]!),
      recordedPointCoordinates(points[index]!),
    );
  }
  return total;
}
