export type GeolocationWatchSource =
  | "location-watch"
  | "maplibre-geolocate"
  | "other";

export type GeolocationWatchSnapshot = {
  watchPositionCalls: number;
  clearWatchCalls: number;
  outstandingCount: number;
  outstandingIds: number[];
  sources: GeolocationWatchSource[];
  lastSource: GeolocationWatchSource | null;
};

type WatchMeta = {
  source: GeolocationWatchSource;
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
};

const DEBUG_LOG_PATH = "/opt/cursor/logs/debug.log";
const DEBUG_ENDPOINT = "/api/debug-geolocation-watch";

let patchedGeolocation: Geolocation | null = null;
let watchPositionCalls = 0;
let clearWatchCalls = 0;
const outstanding = new Map<number, WatchMeta>();
let lastSource: GeolocationWatchSource | null = null;

function classifyCaller(stack: string | undefined): GeolocationWatchSource {
  const text = stack ?? "";
  if (
    /browser-location-watch|startNative|createBrowserLocationWatch/.test(text)
  ) {
    return "location-watch";
  }
  if (/maplibre|GeolocateControl|geolocate_control/.test(text)) {
    return "maplibre-geolocate";
  }
  return "other";
}

function safeOptions(options?: PositionOptions): Pick<
  WatchMeta,
  "enableHighAccuracy" | "maximumAge" | "timeout"
> {
  return {
    enableHighAccuracy: options?.enableHighAccuracy,
    maximumAge: options?.maximumAge,
    timeout: options?.timeout,
  };
}

function appendNodeDebugLog(line: string): void {
  if (typeof process === "undefined" || !process.versions?.node) {
    return;
  }
  void import("node:fs")
    .then((fs) => {
      fs.appendFileSync(DEBUG_LOG_PATH, line);
    })
    .catch(() => {
      // Next.js client bundles cannot load node:fs.
    });
}

export function writeGeolocationWatchLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
}): void {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data ?? {},
  };
  const line = `${JSON.stringify(entry)}\n`;
  appendNodeDebugLog(line);

  const inVitest =
    typeof process !== "undefined" && Boolean(process.env.VITEST);

  if (typeof window !== "undefined") {
    const exposed = window as Window & {
      __RIDE_GEO_WATCH_LOGS__?: unknown[];
    };
    exposed.__RIDE_GEO_WATCH_LOGS__ ??= [];
    exposed.__RIDE_GEO_WATCH_LOGS__.push(entry);
    if (!inVitest) {
      console.info("[RIDE_GEO_WATCH]", entry);
      void fetch(DEBUG_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: line,
        keepalive: true,
      }).catch(() => {});
    }
  }
}

export function getGeolocationWatchSnapshot(): GeolocationWatchSnapshot {
  return {
    watchPositionCalls,
    clearWatchCalls,
    outstandingCount: outstanding.size,
    outstandingIds: [...outstanding.keys()],
    sources: [...outstanding.values()].map((watch) => watch.source),
    lastSource,
  };
}

export function resetGeolocationWatchProbe(): void {
  watchPositionCalls = 0;
  clearWatchCalls = 0;
  outstanding.clear();
  lastSource = null;
}

export function installGeolocationWatchProbe(): GeolocationWatchSnapshot {
  const geo =
    typeof navigator !== "undefined" ? navigator.geolocation : undefined;
  if (!geo) {
    return getGeolocationWatchSnapshot();
  }
  if (patchedGeolocation === geo) {
    return getGeolocationWatchSnapshot();
  }

  const originalWatch = geo.watchPosition.bind(geo);
  const originalClear = geo.clearWatch.bind(geo);

  geo.watchPosition = ((
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ) => {
    const source = classifyCaller(new Error().stack);
    const id = originalWatch(success, error, options);
    watchPositionCalls += 1;
    lastSource = source;
    outstanding.set(id, { source, ...safeOptions(options) });
    const snapshot = getGeolocationWatchSnapshot();
    // #region agent log
    writeGeolocationWatchLog({
      hypothesisId: snapshot.outstandingCount > 1 ? "B" : "A",
      location: "geolocation-watch-probe.ts:watchPosition",
      message:
        snapshot.outstandingCount > 1
          ? "second-or-later native watchPosition"
          : "native watchPosition",
      data: {
        watchId: id,
        source,
        outstandingCount: snapshot.outstandingCount,
        sources: snapshot.sources,
        watchPositionCalls: snapshot.watchPositionCalls,
        enableHighAccuracy: options?.enableHighAccuracy,
        maximumAge: options?.maximumAge,
        timeout: options?.timeout,
      },
    });
    // #endregion
    return id;
  }) as Geolocation["watchPosition"];

  geo.clearWatch = ((id: number) => {
    const removed = outstanding.get(id);
    originalClear(id);
    clearWatchCalls += 1;
    outstanding.delete(id);
    const snapshot = getGeolocationWatchSnapshot();
    // #region agent log
    writeGeolocationWatchLog({
      hypothesisId: "C",
      location: "geolocation-watch-probe.ts:clearWatch",
      message: "native clearWatch",
      data: {
        watchId: id,
        source: removed?.source ?? "other",
        outstandingCount: snapshot.outstandingCount,
        sources: snapshot.sources,
        clearWatchCalls: snapshot.clearWatchCalls,
      },
    });
    // #endregion
  }) as Geolocation["clearWatch"];

  patchedGeolocation = geo;

  if (typeof window !== "undefined") {
    (
      window as Window & {
        __RIDE_GEO_WATCH_PROBE__?: {
          snapshot: () => GeolocationWatchSnapshot;
        };
      }
    ).__RIDE_GEO_WATCH_PROBE__ = {
      snapshot: getGeolocationWatchSnapshot,
    };
  }

  return getGeolocationWatchSnapshot();
}
