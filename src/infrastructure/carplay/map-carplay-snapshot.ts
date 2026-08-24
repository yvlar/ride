import type { Coordinates, LineString } from "@/domain/geo/types";
import { formatFrenchInstruction, roadLabel } from "@/domain/navigation/instructions";
import type { NavigationProgress } from "@/domain/navigation/types";
import type { CarPlayCoordinate, CarPlaySessionSnapshot } from "./types";

export type CarPlaySnapshotInput = {
  geometry: LineString;
  progress: NavigationProgress | null;
  userLocation: Coordinates | null;
  headingDeg?: number | null;
  muted: boolean;
  speakText?: string | null;
  remainingDistanceKm: number;
  remainingDurationMinutes: number;
};

function toCoordinate(point: Coordinates): CarPlayCoordinate {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

export function coordinatesFromLineString(
  geometry: LineString,
): CarPlayCoordinate[] {
  const points: CarPlayCoordinate[] = [];
  for (const position of geometry.coordinates) {
    const longitude = position[0];
    const latitude = position[1];
    if (
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      continue;
    }
    points.push({ latitude, longitude });
  }
  return points;
}

/**
 * Maps domain navigation progress to a JSON snapshot for the CarPlay adapter (FR-028).
 */
export function toCarPlaySessionSnapshot(
  input: CarPlaySnapshotInput,
): CarPlaySessionSnapshot {
  const step = input.progress?.nextStep ?? null;
  const heading = input.headingDeg;
  return {
    coordinates: coordinatesFromLineString(input.geometry),
    userLocation: input.userLocation ? toCoordinate(input.userLocation) : null,
    headingDeg:
      typeof heading === "number" && Number.isFinite(heading) ? heading : null,
    remainingDistanceKm: input.progress?.remainingDistanceKm ?? input.remainingDistanceKm,
    remainingDurationMinutes:
      input.progress?.remainingDurationMinutes ?? input.remainingDurationMinutes,
    muted: input.muted,
    lowAccuracy: input.progress?.lowAccuracy ?? false,
    maneuver: step
      ? {
          instruction: formatFrenchInstruction(step),
          roadLabel: roadLabel(step),
          distanceToManeuverM: input.progress?.distanceToNextManeuverM ?? 0,
          maneuverType: step.maneuverType,
          modifier: step.modifier,
        }
      : null,
    speakText: input.speakText ?? null,
  };
}
