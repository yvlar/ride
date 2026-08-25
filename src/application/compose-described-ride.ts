import { composeRideRequest } from "@/domain/ride/compose-request";
import type { ComposeRideRequestResult } from "@/domain/ride/compose-request";
import {
  DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
  isDescribeDistanceKm,
  snapDescribeDistanceKm,
} from "@/domain/ride/describe-distance";
import { DEFAULT_ROUTE_PREFERENCES } from "@/domain/ride/stored-route-preferences";
import type { Place } from "@/domain/geo/types";
import type {
  GenerateRideRequest,
  GeneratedRideRoute,
  RideStyle,
  RoutePreferences,
} from "@/domain/ride/types";

export const DESCRIBE_START_LABEL = "Position actuelle";
export const DESCRIBE_ARRIVAL_LABEL = "Arrivée proposée";

export const DESCRIBE_DEFAULT_PREFERENCES = DEFAULT_ROUTE_PREFERENCES;

export type ComposeDescribedRideInput = {
  start: Place | null;
  targetDistanceKm: number;
  style?: RideStyle;
  preferences?: RoutePreferences;
};

/**
 * FR-034 — GPS origin + slider distance become a loop request.
 * Duration and manual origin are not part of this flow.
 */
export function composeDescribedRide(
  input: ComposeDescribedRideInput,
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

  if (!isDescribeDistanceKm(input.targetDistanceKm)) {
    return {
      ok: false,
      errors: [
        {
          field: "targetDistanceKm",
          message: DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
        },
      ],
    };
  }

  const composed = composeRideRequest({
    start: input.start,
    type: "loop",
    destination: null,
    targetDistanceKm: snapDescribeDistanceKm(input.targetDistanceKm),
    availableDurationMinutes: null,
    style: input.style ?? "scenic",
    preferences: input.preferences ?? DESCRIBE_DEFAULT_PREFERENCES,
  });
  if (!composed.ok) {
    return composed;
  }
  const request = { ...composed.request };
  delete request.availableDurationMinutes;
  return { ok: true, request };
}

export function describedStartPlace(coordinates: Place["coordinates"]): Place {
  return {
    label: DESCRIBE_START_LABEL,
    coordinates,
  };
}

export function describedArrivalPlace(coordinates: Place["coordinates"]): Place {
  return {
    label: DESCRIBE_ARRIVAL_LABEL,
    coordinates,
  };
}

/**
 * FR-034 — persist the request that matches the generated geometry:
 * a loop, or a one-way whose arrival was chosen by the planner.
 */
export function describedRequestFromGeneratedRoute(
  route: GeneratedRideRoute,
  preferences: RoutePreferences,
): GenerateRideRequest | null {
  if (route.type === "loop") {
    return {
      type: "loop",
      start: route.start,
      targetDistanceKm: route.targetDistanceKm,
      style: route.style,
      preferences,
    };
  }
  if (route.type === "destination") {
    return {
      type: "destination",
      start: route.start,
      destination: route.destination,
      targetDistanceKm: route.targetDistanceKm,
      style: route.style,
      preferences,
    };
  }
  return null;
}

export function describedRouteMatchesReturnToStart(
  route: Pick<GeneratedRideRoute, "type">,
  returnToStart: boolean,
): boolean {
  return returnToStart === (route.type === "loop");
}

/**
 * FR-012 / FR-034 — rebuild the described request that matches the current
 * route type, with a fresh GPS origin and the slider distance.
 */
export function composeDescribedRegenerateRequest(input: {
  start: Place;
  targetDistanceKm: number;
  preferences?: RoutePreferences;
  previousRoute: GeneratedRideRoute;
}): ComposeRideRequestResult {
  if (input.previousRoute.type === "loop") {
    return composeDescribedRide({
      start: input.start,
      targetDistanceKm: input.targetDistanceKm,
      style: input.previousRoute.style,
      preferences: input.preferences,
    });
  }

  if (input.previousRoute.type !== "destination") {
    return {
      ok: false,
      errors: [
        {
          field: "type",
          message:
            "Ce type de trajet ne peut pas être régénéré depuis Décrire mon trajet.",
        },
      ],
    };
  }

  if (!isDescribeDistanceKm(input.targetDistanceKm)) {
    return {
      ok: false,
      errors: [
        {
          field: "targetDistanceKm",
          message: DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE,
        },
      ],
    };
  }

  const preferences = input.preferences ?? DESCRIBE_DEFAULT_PREFERENCES;
  const fromRoute = describedRequestFromGeneratedRoute(
    input.previousRoute,
    preferences,
  );
  if (!fromRoute || fromRoute.type !== "destination") {
    return {
      ok: false,
      errors: [
        {
          field: "destination",
          message: "L’arrivée proposée est requise pour régénérer cet aller.",
        },
      ],
    };
  }

  return {
    ok: true,
    request: {
      ...fromRoute,
      start: input.start,
      targetDistanceKm: snapDescribeDistanceKm(input.targetDistanceKm),
      preferences,
    },
  };
}
