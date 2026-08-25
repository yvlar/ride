import type { Coordinates } from "@/domain/geo/types";
import type { LocationFix } from "@/domain/navigation/types";

/** FR-034 — one-shot precise fix used to generate a described loop. */
export type LocatedPosition = {
  coordinates: Coordinates;
  accuracyMeters: number | null;
};

export type LocationWatchOptions = {
  enableHighAccuracy: true;
  maximumAge: 0;
  timeout: number;
};

export const FOREGROUND_LOCATION_WATCH_OPTIONS: LocationWatchOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10_000,
};

export type LocationPermissionError = {
  code: "PERMISSION_DENIED" | "UNAVAILABLE" | "TIMEOUT" | "POSITION_UNAVAILABLE";
  message: string;
};

export type LocationWatchEvent =
  | { type: "fix"; fix: LocationFix }
  | { type: "error"; error: LocationPermissionError };

export type LocationUnsubscribe = () => void;

/**
 * Shared foreground location port (FR-023, NFR-006).
 * Implementations must expose at most one native watchPosition() at a time.
 */
export type LocationWatch = {
  /**
   * Start the native `watchPosition()` in the current call stack (FR-023).
   * Required on iOS/Safari, where a GPS watch opened later in `useEffect`
   * is outside the user gesture that started navigation.
   */
  start: () => void;
  subscribe: (listener: (event: LocationWatchEvent) => void) => LocationUnsubscribe;
  activeNativeWatches: () => number;
};
