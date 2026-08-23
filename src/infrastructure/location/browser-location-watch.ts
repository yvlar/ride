import {
  FOREGROUND_LOCATION_WATCH_OPTIONS,
  type LocationWatch,
  type LocationWatchEvent,
} from "@/domain/location/types";

export type BrowserGeolocationApi = {
  watchPosition: typeof navigator.geolocation.watchPosition;
  clearWatch: typeof navigator.geolocation.clearWatch;
};

/**
 * Shared foreground watch: many listeners, one native watchPosition (NFR-006).
 */
export function createBrowserLocationWatch(
  api?: BrowserGeolocationApi,
): LocationWatch {
  const listeners = new Set<(event: LocationWatchEvent) => void>();
  let watchId: number | null = null;
  let nativeWatches = 0;

  const geolocation = () =>
    api ??
    (typeof navigator !== "undefined" && navigator.geolocation
      ? navigator.geolocation
      : null);

  function startNative() {
    const geo = geolocation();
    if (!geo || watchId !== null) {
      if (!geo) {
        emit({
          type: "error",
          error: {
            code: "UNAVAILABLE",
            message:
              "La géolocalisation n’est pas disponible dans ce navigateur.",
          },
        });
      }
      return;
    }
    watchId = geo.watchPosition(
      (position) => {
        emit({
          type: "fix",
          fix: {
            coordinates: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            accuracyMeters: position.coords.accuracy,
            headingDeg:
              position.coords.heading == null || Number.isNaN(position.coords.heading)
                ? undefined
                : position.coords.heading,
            speedMetersPerSecond:
              position.coords.speed == null || Number.isNaN(position.coords.speed)
                ? undefined
                : position.coords.speed,
            recordedAtMs: position.timestamp,
          },
        });
      },
      (error) => {
        emit({
          type: "error",
          error: {
            code:
              error.code === error.PERMISSION_DENIED
                ? "PERMISSION_DENIED"
                : error.code === error.TIMEOUT
                  ? "TIMEOUT"
                  : "POSITION_UNAVAILABLE",
            message:
              error.code === error.PERMISSION_DENIED
                ? "L’autorisation de localisation a été refusée."
                : "La position GPS n’est pas disponible.",
          },
        });
      },
      FOREGROUND_LOCATION_WATCH_OPTIONS,
    );
    nativeWatches += 1;
  }

  function stopNative() {
    const geo = geolocation();
    if (watchId !== null && geo) {
      geo.clearWatch(watchId);
    }
    watchId = null;
    nativeWatches = 0;
  }

  function emit(event: LocationWatchEvent) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        startNative();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopNative();
        }
      };
    },
    activeNativeWatches() {
      return nativeWatches;
    },
  };
}
