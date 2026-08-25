import type { Coordinates } from "@/domain/geo/types";
import type { LocatedPosition } from "@/domain/location/types";

export const CURRENT_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10_000,
};

export type GeolocationFailureReason =
  | "unsupported"
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unknown";

export const GEOLOCATION_ERROR_MESSAGES: Record<
  GeolocationFailureReason,
  string
> = {
  unsupported:
    "La géolocalisation n’est pas prise en charge sur cet appareil.",
  permission_denied:
    "Autorisez la position actuelle pour l’utiliser comme départ.",
  position_unavailable:
    "La position actuelle est indisponible. Réessayez.",
  timeout: "La localisation a pris trop de temps. Réessayez.",
  unknown: "Impossible d’obtenir la position actuelle. Réessayez.",
};

export class CurrentPositionError extends Error {
  readonly reason: GeolocationFailureReason;

  constructor(reason: GeolocationFailureReason) {
    super(GEOLOCATION_ERROR_MESSAGES[reason]);
    this.name = "CurrentPositionError";
    this.reason = reason;
  }
}

export function classifyGeolocationError(
  error: { code?: number } | null | undefined,
): GeolocationFailureReason {
  if (!error || typeof error.code !== "number") {
    return "unknown";
  }
  if (error.code === 1) {
    return "permission_denied";
  }
  if (error.code === 2) {
    return "position_unavailable";
  }
  if (error.code === 3) {
    return "timeout";
  }
  return "unknown";
}

export function getBrowserGeolocation(): Geolocation | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return navigator.geolocation;
}

export function requestCurrentPosition(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined =
    getBrowserGeolocation(),
): Promise<LocatedPosition> {
  if (!geolocation) {
    return Promise.reject(new CurrentPositionError("unsupported"));
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        resolve({
          coordinates: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          accuracyMeters:
            typeof accuracy === "number" && Number.isFinite(accuracy)
              ? accuracy
              : null,
        });
      },
      (error) => {
        reject(new CurrentPositionError(classifyGeolocationError(error)));
      },
      CURRENT_POSITION_OPTIONS,
    );
  });
}

export async function requestCurrentCoordinates(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined =
    getBrowserGeolocation(),
): Promise<Coordinates> {
  const located = await requestCurrentPosition(geolocation);
  return located.coordinates;
}
