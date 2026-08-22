import type { RideType } from "./types";

export const TARGET_DISTANCE_REQUIRED_MESSAGE =
  "Indiquez une distance cible ou une durée disponible pour une boucle.";

export const TARGET_DISTANCE_POSITIVE_KM_MESSAGE =
  "La distance cible doit être supérieure à 0 km.";

export const TARGET_DISTANCE_HINT_REQUIRED =
  "En kilomètres. Obligatoire pour une boucle sans durée disponible.";

export const TARGET_DISTANCE_HINT_OPTIONAL =
  "En kilomètres. Facultatif pour ce type de trajet.";

export const TARGET_DISTANCE_HINT_OPTIONAL_WITH_DURATION =
  "En kilomètres. Facultatif si une durée disponible est indiquée.";

/**
 * FR-009 — a target distance is mandatory for a loop when no available
 * duration is provided. It stays optional for destination and round-trip.
 */
export function isTargetDistanceRequired(
  type: RideType,
  hasAvailableDuration: boolean,
): boolean {
  return type === "loop" && !hasAvailableDuration;
}

export function targetDistanceHint(
  type: RideType,
  hasAvailableDuration: boolean,
): string {
  if (isTargetDistanceRequired(type, hasAvailableDuration)) {
    return TARGET_DISTANCE_HINT_REQUIRED;
  }

  if (type === "loop" && hasAvailableDuration) {
    return TARGET_DISTANCE_HINT_OPTIONAL_WITH_DURATION;
  }

  return TARGET_DISTANCE_HINT_OPTIONAL;
}

export function isValidTargetDistanceKm(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export type TargetDistanceParseResult =
  | { ok: true; targetDistanceKm: number | undefined }
  | { ok: false; message: string };

/** FR-009 — accept an explicit target length in kilometres, or omit it when optional. */
export function parseTargetDistanceKm(
  value: number | null | undefined,
  options: { required: boolean },
): TargetDistanceParseResult {
  if (value == null) {
    if (options.required) {
      return { ok: false, message: TARGET_DISTANCE_REQUIRED_MESSAGE };
    }
    return { ok: true, targetDistanceKm: undefined };
  }

  if (!isValidTargetDistanceKm(value)) {
    return { ok: false, message: TARGET_DISTANCE_POSITIVE_KM_MESSAGE };
  }

  return { ok: true, targetDistanceKm: value };
}
