import {
  FOREGROUND_LOCATION_WATCH_OPTIONS,
  type LocationWatch,
  type LocationWatchEvent,
} from "@/domain/location/types";
import {
  getGeolocationWatchSnapshot,
  installGeolocationWatchProbe,
  writeGeolocationWatchLog,
} from "@/infrastructure/location/geolocation-watch-probe";

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
  let lastEvent: LocationWatchEvent | null = null;

  const geolocation = () =>
    api ??
    (typeof navigator !== "undefined" && navigator.geolocation
      ? navigator.geolocation
      : null);

  function startNative() {
    installGeolocationWatchProbe();
    const geo = geolocation();
    const usingInjectedApi = Boolean(api);
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
    try {
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
      // #region agent log
      writeGeolocationWatchLog({
        hypothesisId: "B",
        location: "browser-location-watch.ts:startNative:after",
        message: "LocationWatch startNative after watchPosition",
        data: {
          usingInjectedApi,
          locationWatchNative: nativeWatches,
          probe: getGeolocationWatchSnapshot(),
        },
      });
      // #endregion
    } catch {
      watchId = null;
      emit({
        type: "error",
        error: {
          code: "UNAVAILABLE",
          message:
            "La géolocalisation n’est pas disponible dans ce navigateur.",
        },
      });
    }
  }

  function stopNative() {
    const geo = geolocation();
    if (watchId !== null && geo) {
      geo.clearWatch(watchId);
    }
    watchId = null;
    nativeWatches = 0;
    lastEvent = null;
  }

  function emit(event: LocationWatchEvent) {
    lastEvent = event;
    for (const listener of listeners) {
      listener(event);
    }
  }

  return {
    start() {
      startNative();
    },
    subscribe(listener) {
      listeners.add(listener);
      // A failed start() leaves watchId null but already stored lastEvent.
      // Do not call startNative again: emit() would notify this listener,
      // then the replay below would deliver the same error a second time.
      if (watchId === null && lastEvent === null) {
        startNative();
      } else if (lastEvent) {
        listener(lastEvent);
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
