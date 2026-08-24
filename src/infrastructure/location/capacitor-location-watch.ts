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
function agentLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) {
  // #region agent log
  try {
    if (process.env.VITEST !== "true") {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    fs.mkdirSync("/opt/cursor/logs", { recursive: true });
    fs.appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({ hypothesisId, location, message, data, timestamp: Date.now() })}\n`,
    );
  } catch {
    // Ignore missing fs in non-Node bundles.
  }
  // #endregion
}

export function createCapacitorLocationWatch(
  api: CapacitorGeolocationApi,
): LocationWatch {
  const listeners = new Set<(event: LocationWatchEvent) => void>();
  let watchId: string | null = null;
  let nativeWatches = 0;
  let lastEvent: LocationWatchEvent | null = null;
  let starting = false;
  let startGeneration = 0;

  function emit(event: LocationWatchEvent) {
    lastEvent = event;
    for (const listener of listeners) {
      listener(event);
    }
  }

  function startNative() {
    // #region agent log
    agentLog("A", "capacitor-location-watch.ts:startNative:entry", "startNative entry", {
      watchId,
      starting,
      listenerCount: listeners.size,
      nativeWatches,
    });
    // #endregion
    if (watchId !== null || starting) {
      // #region agent log
      agentLog("D", "capacitor-location-watch.ts:startNative:skip", "startNative no-op", {
        reason: watchId !== null ? "watchId_set" : "starting",
        watchId,
        starting,
        listenerCount: listeners.size,
      });
      // #endregion
      return;
    }
    starting = true;
    const generation = startGeneration;
    void (async () => {
      try {
        const permission = await api.requestPermissions?.();
        // #region agent log
        agentLog("E", "capacitor-location-watch.ts:startNative:afterPermissions", "requestPermissions resolved", {
          location: permission?.location ?? null,
          listenerCount: listeners.size,
          watchId,
          starting,
          generation,
          startGeneration,
          cancelled: generation !== startGeneration,
        });
        // #endregion
        if (generation !== startGeneration) {
          // #region agent log
          agentLog("E", "capacitor-location-watch.ts:startNative:cancelAfterPermissions", "skip watchPosition after stop", {
            generation,
            startGeneration,
            listenerCount: listeners.size,
            runId: "post-fix",
          });
          // #endregion
          return;
        }
        if (permission?.location === "denied") {
          emit(toWatchError("OS-PLUG-GLOC-0003"));
          return;
        }
        const id = await api.watchPosition(
          CAPACITOR_FOREGROUND_POSITION_OPTIONS,
          (position, error) => {
            if (generation !== startGeneration) {
              return;
            }
            if (error || !position) {
              emit(toWatchError(error));
              return;
            }
            emit(toFix(position));
          },
        );
        // #region agent log
        agentLog("A", "capacitor-location-watch.ts:startNative:beforeAssign", "watchPosition resolved, about to assign watchId", {
          id,
          listenerCount: listeners.size,
          previousWatchId: watchId,
          starting,
          nativeWatches,
          generation,
          startGeneration,
          cancelled: generation !== startGeneration,
        });
        // #endregion
        if (generation !== startGeneration) {
          // #region agent log
          agentLog("A", "capacitor-location-watch.ts:startNative:discardInFlight", "clearWatch after cancelled start", {
            id,
            generation,
            startGeneration,
            listenerCount: listeners.size,
            runId: "post-fix",
          });
          // #endregion
          void api.clearWatch({ id }).catch(() => {
            // NFR-006: cleanup must not throw into the UI.
          });
          return;
        }
        watchId = id;
        nativeWatches = 1;
        // #region agent log
        agentLog("A", "capacitor-location-watch.ts:startNative:afterAssign", "watchId assigned after async start", {
          watchId,
          listenerCount: listeners.size,
          starting,
          nativeWatches,
          orphaned: listeners.size === 0,
          generation,
          startGeneration,
        });
        // #endregion
      } catch (error) {
        if (generation !== startGeneration) {
          return;
        }
        emit(toWatchError(error as CapacitorGeolocationError | string));
      } finally {
        if (generation === startGeneration) {
          starting = false;
        }
      }
    })();
  }

  function stopNative() {
    const id = watchId;
    startGeneration += 1;
    // #region agent log
    agentLog("A", "capacitor-location-watch.ts:stopNative", "stopNative", {
      watchId: id,
      willClearWatch: Boolean(id),
      starting,
      listenerCount: listeners.size,
      nativeWatches,
      startGeneration,
    });
    // #endregion
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
      // #region agent log
      agentLog("C", "capacitor-location-watch.ts:subscribe", "subscribe", {
        listenerCount: listeners.size,
        watchId,
        starting,
        lastEventType: lastEvent?.type ?? null,
      });
      // #endregion
      if (watchId === null && lastEvent === null && !starting) {
        startNative();
      } else if (lastEvent) {
        listener(lastEvent);
      }
      return () => {
        listeners.delete(listener);
        // #region agent log
        agentLog("A", "capacitor-location-watch.ts:unsubscribe", "unsubscribe", {
          listenerCount: listeners.size,
          watchId,
          starting,
        });
        // #endregion
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
