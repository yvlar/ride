import {
  FOREGROUND_LOCATION_WATCH_OPTIONS,
  type LocatedPosition,
} from "@/domain/location/types";
import type { Coordinates } from "@/domain/geo/types";
import {
  CurrentPositionError,
  type GeolocationFailureReason,
} from "@/components/ride-form/browser-geolocation";

export const CAPACITOR_FOREGROUND_POSITION_OPTIONS = {
  enableHighAccuracy: FOREGROUND_LOCATION_WATCH_OPTIONS.enableHighAccuracy,
  maximumAge: FOREGROUND_LOCATION_WATCH_OPTIONS.maximumAge,
  timeout: FOREGROUND_LOCATION_WATCH_OPTIONS.timeout,
} as const;

export type CapacitorCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
};

export type CapacitorPosition = {
  timestamp: number;
  coords: CapacitorCoordinates;
};

export type CapacitorGeolocationError = {
  message?: string;
  code?: string;
};

export type CapacitorWatchCallback = (
  position: CapacitorPosition | null,
  err?: CapacitorGeolocationError | string,
) => void;

export type CapacitorGeolocationApi = {
  watchPosition: (
    options: typeof CAPACITOR_FOREGROUND_POSITION_OPTIONS,
    callback: CapacitorWatchCallback,
  ) => Promise<string>;
  clearWatch: (options: { id: string }) => Promise<void>;
  getCurrentPosition: (
    options?: typeof CAPACITOR_FOREGROUND_POSITION_OPTIONS,
  ) => Promise<CapacitorPosition>;
  requestPermissions?: () => Promise<{ location: string }>;
};

export function capacitorErrorMessage(
  error: CapacitorGeolocationError | string | undefined,
): string {
  if (typeof error === "string") {
    return error;
  }
  return error?.message ?? error?.code ?? "";
}

export function classifyCapacitorGeolocationError(
  error: CapacitorGeolocationError | string | undefined,
): GeolocationFailureReason {
  const text = capacitorErrorMessage(error).toUpperCase();
  if (
    text.includes("0003") ||
    text.includes("DENIED") ||
    text.includes("RESTRICTED") ||
    text.includes("0008")
  ) {
    return "permission_denied";
  }
  if (text.includes("0010") || text.includes("TIMEOUT")) {
    return "timeout";
  }
  if (
    text.includes("0007") ||
    text.includes("UNAVAILABLE") ||
    text.includes("NOT ENABLED")
  ) {
    return "position_unavailable";
  }
  return "unknown";
}

export function coordinatesFromCapacitorPosition(
  position: CapacitorPosition,
): Coordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export async function requestCapacitorCurrentPosition(
  api: CapacitorGeolocationApi,
): Promise<LocatedPosition> {
  try {
    const permission = await api.requestPermissions?.();
    if (permission?.location === "denied") {
      throw new CurrentPositionError("permission_denied");
    }
    const position = await api.getCurrentPosition(
      CAPACITOR_FOREGROUND_POSITION_OPTIONS,
    );
    const accuracy = position.coords.accuracy;
    return {
      coordinates: coordinatesFromCapacitorPosition(position),
      accuracyMeters:
        typeof accuracy === "number" && Number.isFinite(accuracy)
          ? accuracy
          : null,
    };
  } catch (error) {
    if (error instanceof CurrentPositionError) {
      throw error;
    }
    throw new CurrentPositionError(
      classifyCapacitorGeolocationError(
        error as CapacitorGeolocationError | string,
      ),
    );
  }
}

export async function requestCapacitorCurrentCoordinates(
  api: CapacitorGeolocationApi,
): Promise<Coordinates> {
  const located = await requestCapacitorCurrentPosition(api);
  return located.coordinates;
}
