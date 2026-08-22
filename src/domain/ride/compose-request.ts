import {
  durationToEstimatedDistanceKm,
  parseAvailableDurationMinutes,
} from "@/domain/ride/duration";
import {
  TARGET_DISTANCE_REQUIRED_MESSAGE,
  isTargetDistanceRequired,
  parseTargetDistanceKm,
} from "@/domain/ride/target-distance";
import type {
  GenerateRideRequest,
  RideFormError,
  RideFormInput,
} from "@/domain/ride/types";

export type ComposeRideRequestResult =
  | { ok: true; request: GenerateRideRequest }
  | { ok: false; errors: RideFormError[] };

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
  const parsedDuration = parseAvailableDurationMinutes(
    input.availableDurationMinutes,
  );
  const hasDuration =
    parsedDuration.ok && parsedDuration.availableDurationMinutes !== undefined;
  const parsedDistance = parseTargetDistanceKm(distanceInput, {
    required: isTargetDistanceRequired(input.type, hasDuration),
  });

  if (!parsedDistance.ok) {
    errors.push({
      field: "targetDistanceKm",
      message: parsedDistance.message,
    });
  }

  if (!parsedDuration.ok) {
    errors.push({
      field: "availableDurationMinutes",
      message: parsedDuration.message,
    });
  }

  if (errors.length > 0 || !input.start) {
    return { ok: false, errors };
  }

  const explicitTargetDistanceKm = parsedDistance.ok
    ? parsedDistance.targetDistanceKm
    : undefined;
  const availableDurationMinutes = parsedDuration.ok
    ? parsedDuration.availableDurationMinutes
    : undefined;
  const targetDistanceKm =
    explicitTargetDistanceKm !== undefined
      ? explicitTargetDistanceKm
      : availableDurationMinutes !== undefined
        ? durationToEstimatedDistanceKm(availableDurationMinutes, input.style)
        : undefined;

  if (input.type === "loop") {
    if (targetDistanceKm === undefined) {
      return {
        ok: false,
        errors: [
          {
            field: "targetDistanceKm",
            message: TARGET_DISTANCE_REQUIRED_MESSAGE,
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
