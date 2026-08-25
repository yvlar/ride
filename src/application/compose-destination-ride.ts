import { composeRideRequest } from "@/domain/ride/compose-request";
import type { ComposeRideRequestResult } from "@/domain/ride/compose-request";
import { DEFAULT_ROUTE_PREFERENCES } from "@/domain/ride/stored-route-preferences";
import type { Place } from "@/domain/geo/types";
import type { RideStyle, RoutePreferences } from "@/domain/ride/types";

export const DESTINATION_SEARCH_DEFAULT_STYLE: RideStyle = "scenic";

export type ComposeDestinationRideInput = {
  start: Place | null;
  destination: Place | null;
  style?: RideStyle;
  preferences?: RoutePreferences;
};

/**
 * FR-038 — GPS origin + selected destination become an FR-002 request.
 * Distance, duration, and compose-form controls are not part of this flow.
 */
export function composeDestinationRide(
  input: ComposeDestinationRideInput,
): ComposeRideRequestResult {
  if (!input.start) {
    return {
      ok: false,
      errors: [
        {
          field: "start",
          message: "La position actuelle est requise pour générer le trajet.",
        },
      ],
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

  const composed = composeRideRequest({
    start: input.start,
    type: "destination",
    destination: input.destination,
    targetDistanceKm: null,
    availableDurationMinutes: null,
    style: input.style ?? DESTINATION_SEARCH_DEFAULT_STYLE,
    preferences: input.preferences ?? DEFAULT_ROUTE_PREFERENCES,
  });
  if (!composed.ok) {
    return composed;
  }
  const request = { ...composed.request };
  delete request.targetDistanceKm;
  delete request.availableDurationMinutes;
  return { ok: true, request };
}
