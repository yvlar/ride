import { AVERAGE_SPEED_KMH } from "./constants";
import type { RideStyle } from "./types";

export { AVERAGE_SPEED_KMH };

/** BR-005 — convert an available duration into an estimated target distance. */
export function durationToEstimatedDistanceKm(
  durationMinutes: number,
  style: RideStyle = "touring",
): number {
  const speedKmh = AVERAGE_SPEED_KMH[style];
  return (durationMinutes / 60) * speedKmh;
}

export function resolveTargetDistanceKm(input: {
  targetDistanceKm?: number;
  availableDurationMinutes?: number;
  style?: RideStyle;
}): number | undefined {
  if (input.targetDistanceKm !== undefined) {
    return input.targetDistanceKm;
  }
  if (input.availableDurationMinutes !== undefined) {
    return durationToEstimatedDistanceKm(
      input.availableDurationMinutes,
      input.style ?? "touring",
    );
  }
  return undefined;
}

export function hoursToMinutes(hours: number): number {
  return hours * 60;
}
