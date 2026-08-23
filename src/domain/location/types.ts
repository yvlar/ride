import type { LocationFix } from "@/domain/navigation/types";

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
  subscribe: (listener: (event: LocationWatchEvent) => void) => LocationUnsubscribe;
  activeNativeWatches: () => number;
};
