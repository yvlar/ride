import { AVERAGE_SPEED_KMH } from "./constants";
import type { RideStyle } from "./types";

export { AVERAGE_SPEED_KMH };

export const AVAILABLE_DURATION_POSITIVE_MESSAGE =
  "La durée disponible doit être supérieure à 0.";

export const AVAILABLE_DURATION_HINT =
  "En heures. Peut remplacer la distance, ou la compléter comme plafond.";

/**
 * FR-010 — compare on whole minutes so a sub-minute float gap is not treated
 * as a clear ceiling miss (« dépasse nettement »).
 */
export function clearlyExceedsAvailableDuration(
  estimatedDurationMinutes: number,
  availableDurationMinutes: number,
): boolean {
  return (
    Math.round(estimatedDurationMinutes) > Math.round(availableDurationMinutes)
  );
}

export function availableDurationCeilingWarning(
  estimatedDurationMinutes: number,
  availableDurationMinutes: number,
): string {
  return `La durée estimée (${Math.round(estimatedDurationMinutes)} min) dépasse nettement la durée disponible (${Math.round(availableDurationMinutes)} min).`;
}

export function isValidAvailableDurationMinutes(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export type AvailableDurationParseResult =
  | { ok: true; availableDurationMinutes: number | undefined }
  | { ok: false; message: string };

/** FR-010 — accept an optional positive available duration in minutes. */
export function parseAvailableDurationMinutes(
  value: number | null | undefined,
): AvailableDurationParseResult {
  if (value == null) {
    return { ok: true, availableDurationMinutes: undefined };
  }

  if (!isValidAvailableDurationMinutes(value)) {
    return { ok: false, message: AVAILABLE_DURATION_POSITIVE_MESSAGE };
  }

  return { ok: true, availableDurationMinutes: value };
}

export function withAvailableDurationCeiling<
  T extends { warnings: string[]; candidate: { durationMinutes: number } },
>(evaluation: T, availableDurationMinutes?: number): T {
  if (availableDurationMinutes === undefined) {
    return evaluation;
  }

  if (
    !clearlyExceedsAvailableDuration(
      evaluation.candidate.durationMinutes,
      availableDurationMinutes,
    )
  ) {
    return evaluation;
  }

  const warning = availableDurationCeilingWarning(
    evaluation.candidate.durationMinutes,
    availableDurationMinutes,
  );
  if (evaluation.warnings.includes(warning)) {
    return evaluation;
  }

  return {
    ...evaluation,
    warnings: [...evaluation.warnings, warning],
  };
}

/** BR-005 — convert an available duration into an estimated target distance. */
export function durationToEstimatedDistanceKm(
  durationMinutes: number,
  style: RideStyle = "touring",
): number {
  const speedKmh = AVERAGE_SPEED_KMH[style];
  return (durationMinutes / 60) * speedKmh;
}

/**
 * FR-010 / BR-001 — an explicit distance stays the length constraint.
 * Duration alone is converted via BR-005.
 */
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
