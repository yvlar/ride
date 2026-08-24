import type { LocationWatch, LocationWatchEvent } from "@/domain/location/types";
import {
  CAPACITOR_FOREGROUND_POSITION_OPTIONS,
  classifyCapacitorGeolocationError,
  type CapacitorGeolocationApi,
  type CapacitorGeolocationError,
  type CapacitorPosition,
} from "./capacitor-geolocation";

function toWatchError(
  error: CapacitorGeolocationError | string | undefined,
): LocationWatchEvent {
  const reason = classifyCapacitorGeolocationError(error);
  const code =
    reason === "permission_denied"
      ? "PERMISSION_DENIED"
      : reason === "timeout"
        ? "TIMEOUT"
        : reason === "position_unavailable"
          ? "POSITION_UNAVAILABLE"
          : "UNAVAILABLE";
  const message =
    code === "PERMISSION_DENIED"
      ? "L’autorisation de localisation a été refusée."
      : code === "TIMEOUT"
        ? "La localisation a pris trop de temps. Réessayez."
        : "La position GPS n’est pas disponible.";
  return {
    type: "error",
    error: { code, message },
  };
}

function toFix(position: CapacitorPosition): LocationWatchEvent {
  return {
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
  };
}

/**
 * Foreground LocationWatch backed by the Capacitor Geolocation plugin (FR-027).
 * Same port as the browser watch (FR-022, FR-023, NFR-006, NFR-007).
 */
export function createCapacitorLocationWatch(
  api: CapacitorGeolocationApi,
): LocationWatch {
  const listeners = new Set<(event: LocationWatchEvent) => void>();
  let watchId: string | null = null;
  let nativeWatches = 0;
  let lastEvent: LocationWatchEvent | null = null;
  let starting = false;

  function emit(event: LocationWatchEvent) {
    lastEvent = event;
    for (const listener of listeners) {
      listener(event);
    }
  }

  function startNative() {
    if (watchId !== null || starting) {
      return;
    }
    starting = true;
    void (async () => {
      try {
        const permission = await api.requestPermissions?.();
        if (permission?.location === "denied") {
          emit(toWatchError("OS-PLUG-GLOC-0003"));
          return;
        }
        const id = await api.watchPosition(
          CAPACITOR_FOREGROUND_POSITION_OPTIONS,
          (position, error) => {
            if (error || !position) {
              emit(toWatchError(error));
              return;
            }
            emit(toFix(position));
          },
        );
        watchId = id;
        nativeWatches = 1;
      } catch (error) {
        emit(toWatchError(error as CapacitorGeolocationError | string));
      } finally {
        starting = false;
      }
    })();
  }

  function stopNative() {
    const id = watchId;
    watchId = null;
    nativeWatches = 0;
    lastEvent = null;
    starting = false;
    if (id) {
      void api.clearWatch({ id }).catch(() => {
        // NFR-006: cleanup must not throw into the UI.
      });
    }
  }

  return {
    start() {
      startNative();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (watchId === null && lastEvent === null && !starting) {
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
