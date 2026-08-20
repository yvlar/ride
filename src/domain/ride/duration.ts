import type { RideStyle } from "@/domain/ride/types";

/**
 * Average speeds used to convert an available duration into a target
 * distance (BR-005). Adjust these constants without changing adapters.
 */
export const AVERAGE_SPEED_KMH: Record<RideStyle, number> = {
  curvy: 55,
  scenic: 70,
  touring: 85,
};

export function estimateDistanceKmFromDuration(
  durationMinutes: number,
  style: RideStyle,
): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("availableDurationMinutes must be a positive number");
  }

  return (durationMinutes / 60) * AVERAGE_SPEED_KMH[style];
}

export function hoursToMinutes(hours: number): number {
  return hours * 60;
}
