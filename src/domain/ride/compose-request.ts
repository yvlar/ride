import { durationToEstimatedDistanceKm } from "@/domain/ride/duration";
import type {
  GenerateRideRequest,
  RideFormError,
  RideFormInput,
} from "@/domain/ride/types";

export type ComposeRideRequestResult =
  | { ok: true; request: GenerateRideRequest }
  | { ok: false; errors: RideFormError[] };

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function composeRideRequest(
  input: RideFormInput,
): ComposeRideRequestResult {
  const errors: RideFormError[] = [];

  if (!input.start) {
    errors.push({
      field: "start",
      message: "Indiquez un point de départ.",
    });
  }

  if (input.type === "destination" || input.type === "round_trip") {
    if (!input.destination) {
      errors.push({
        field: "destination",
        message: "Indiquez une destination.",
      });
    }
  }

  const distanceInput = input.targetDistanceKm;
  const durationInput = input.availableDurationMinutes;
  const hasDistance = isPositiveNumber(distanceInput);
  const hasDuration = isPositiveNumber(durationInput);

  if (distanceInput != null && !hasDistance) {
    errors.push({
      field: "targetDistanceKm",
      message: "La distance cible doit être supérieure à 0 km.",
    });
  }

  if (durationInput != null && !hasDuration) {
    errors.push({
      field: "availableDurationMinutes",
      message: "La durée disponible doit être supérieure à 0.",
    });
  }

  if (input.type === "loop" && !hasDistance && !hasDuration) {
    errors.push({
      field: "targetDistanceKm",
      message:
        "Indiquez une distance cible ou une durée disponible pour une boucle.",
    });
  }

  if (errors.length > 0 || !input.start) {
    return { ok: false, errors };
  }

  const targetDistanceKm = hasDistance
    ? distanceInput
    : hasDuration
      ? durationToEstimatedDistanceKm(durationInput, input.style)
      : undefined;

  const availableDurationMinutes = hasDuration ? durationInput : undefined;

  if (input.type === "loop") {
    if (targetDistanceKm === undefined) {
      return {
        ok: false,
        errors: [
          {
            field: "targetDistanceKm",
            message:
              "Indiquez une distance cible ou une durée disponible pour une boucle.",
          },
        ],
      };
    }

    return {
      ok: true,
      request: {
        type: "loop",
        start: input.start,
        targetDistanceKm,
        availableDurationMinutes,
        style: input.style,
        preferences: input.preferences,
      },
    };
  }

  if (!input.destination) {
    return {
      ok: false,
      errors: [
        {
          field: "destination",
          message: "Indiquez une destination.",
        },
      ],
    };
  }

  return {
    ok: true,
    request: {
      type: input.type,
      start: input.start,
      destination: input.destination,
      targetDistanceKm,
      availableDurationMinutes,
      style: input.style,
      preferences: input.preferences,
    },
  };
}
