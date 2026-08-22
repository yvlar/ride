import { Map as MapLibreMap, Marker, getWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { coordinatesToPosition } from "@/domain/geo/distance";
import { FALLBACK_MAP_STYLE } from "./fallback-style";
import {
  MAP_UNAVAILABLE_MESSAGE,
  type MapEngine,
  type MapEngineHandle,
} from "./map-engine";
import {
  createDirectionArrowElement,
  createPlaceMarkerElement,
} from "./ride-map-markers";
import "./ride-map-markers.css";
import { mapCameraFrame, type RideMapViewModel } from "./ride-map-view-model";

// #region agent log
function debugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
): void {
  const payload = {
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  console.info("[ride-debug-map]", payload);
  void fetch("/api/debug-map-worker-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function inspectDefaultWorkerUrl(): Record<string, unknown> {
  const moduleUrl = import.meta.url;
  const httpLike = /^https?:/.test(moduleUrl);
  const workerName = moduleUrl.endsWith("-dev.mjs")
    ? "maplibre-gl-worker-dev.mjs"
    : "maplibre-gl-worker.mjs";
  let derived = "";
  try {
    derived = httpLike ? new URL(`./${workerName}`, moduleUrl).href : "";
  } catch (error) {
    derived = `error:${error instanceof Error ? error.message : "unknown"}`;
  }
  return {
    engineImportMetaUrl: moduleUrl,
    engineImportMetaHttpLike: httpLike,
    derivedSiblingWorkerUrl: derived,
    configuredGetWorkerUrl: getWorkerUrl(),
    locationHref: typeof location === "undefined" ? null : location.href,
  };
}

function installWorkerProbe(): () => void {
  const OriginalWorker = globalThis.Worker;
  if (!OriginalWorker || (OriginalWorker as { __rideDebug?: boolean }).__rideDebug) {
    return () => {};
  }

  function PatchedWorker(
    this: Worker,
    scriptURL: string | URL,
    options?: WorkerOptions,
  ) {
    const url = String(scriptURL);
    const blob = url.startsWith("blob:");
    debugLog("A", "maplibre-map-engine.ts:Worker", "Worker constructed", {
      url,
      urlLength: url.length,
      urlEmpty: url === "",
      blob,
      type: options?.type ?? null,
      ...inspectDefaultWorkerUrl(),
    });
    try {
      const worker = new OriginalWorker(scriptURL, options);
      worker.addEventListener("error", (event) => {
        debugLog("A", "maplibre-map-engine.ts:Worker.error", "Worker error event", {
          url,
          message: event.message,
          filename: event.filename,
        });
      });
      return worker;
    } catch (error) {
      debugLog("A", "maplibre-map-engine.ts:Worker.throw", "Worker constructor threw", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  PatchedWorker.prototype = OriginalWorker.prototype;
  Object.setPrototypeOf(PatchedWorker, OriginalWorker);
  (PatchedWorker as { __rideDebug?: boolean }).__rideDebug = true;
  globalThis.Worker = PatchedWorker as unknown as typeof Worker;
  return () => {
    globalThis.Worker = OriginalWorker;
  };
}
// #endregion

export function createMapLibreEngine(): MapEngine {
  return {
    mount(container, viewModel, { onError }): MapEngineHandle {
      const markers: Marker[] = [];
      let map: MapLibreMap | undefined;
      let disposed = false;
      // #region agent log
      const restoreWorker = installWorkerProbe();
      debugLog("B", "maplibre-map-engine.ts:mount", "Engine mount entry", {
        ...inspectDefaultWorkerUrl(),
        containerWidth: container.clientWidth,
        containerHeight: container.clientHeight,
        hasStyleEnv: Boolean(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
      });
      // #endregion

      const camera = mapCameraFrame(viewModel.bounds);

      try {
        map = new MapLibreMap({
          container,
          style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_MAP_STYLE,
          attributionControl: { compact: true },
          bounds: camera.bounds,
          fitBoundsOptions: camera.fitBoundsOptions,
        });
      } catch {
        // #region agent log
        debugLog("C", "maplibre-map-engine.ts:constructor", "Map constructor threw", {
          ...inspectDefaultWorkerUrl(),
        });
        restoreWorker();
        // #endregion
        onError(MAP_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      }

      map.on("error", (event) => {
        // #region agent log
        const error = "error" in event ? event.error : undefined;
        debugLog("C", "maplibre-map-engine.ts:error", "Map error event", {
          styleLoaded: Boolean(map?.isStyleLoaded()),
          errorMessage: error instanceof Error ? error.message : String(error ?? ""),
          errorName: error instanceof Error ? error.name : typeof error,
        });
        // #endregion
        if (disposed || !map || map.isStyleLoaded()) {
          return;
        }
        onError(MAP_UNAVAILABLE_MESSAGE);
      });

      map.on("load", () => {
        // #region agent log
        debugLog("D", "maplibre-map-engine.ts:load", "Map load event", {
          styleLoaded: Boolean(map?.isStyleLoaded()),
          canvasCount: container.querySelectorAll("canvas").length,
          workerCount:
            typeof performance !== "undefined"
              ? performance.getEntriesByType("resource").filter((entry) =>
                  /worker|maplibre/i.test(entry.name),
                ).length
              : null,
        });
        // #endregion
        if (disposed || !map) {
          return;
        }

        map.addSource("ride-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: viewModel.geometry,
          },
        });
        map.addLayer({
          id: "ride-route-line",
          type: "line",
          source: "ride-route",
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#38bdf8",
            "line-width": 4,
          },
        });

        markers.push(placeMarker(map, viewModel.start.label, viewModel.start.coordinates));
        if (viewModel.destination) {
          markers.push(
            placeMarker(
              map,
              viewModel.destination.label,
              viewModel.destination.coordinates,
            ),
          );
        }
        for (const arrow of viewModel.directionArrows) {
          markers.push(placeArrow(map, arrow));
        }

        map.fitBounds(camera.bounds, camera.fitBoundsOptions);
        // #region agent log
        debugLog("D", "maplibre-map-engine.ts:route", "Route source and layer added", {
          hasRouteSource: Boolean(map.getSource("ride-route")),
          hasRouteLayer: Boolean(map.getLayer("ride-route-line")),
          markerCount: markers.length,
        });
        // #endregion
      });

      // #region agent log
      map.on("idle", () => {
        if (disposed || !map) {
          return;
        }
        const canvas = container.querySelector("canvas");
        debugLog("E", "maplibre-map-engine.ts:idle", "Map idle after work", {
          styleLoaded: map.isStyleLoaded(),
          canvasWidth: canvas?.width ?? 0,
          canvasHeight: canvas?.height ?? 0,
          hasRouteLayer: Boolean(map.getLayer("ride-route-line")),
        });
      });
      // #endregion

      return {
        destroy() {
          disposed = true;
          for (const marker of markers) {
            marker.remove();
          }
          markers.length = 0;
          map?.remove();
          map = undefined;
          // #region agent log
          restoreWorker();
          // #endregion
        },
      };
    },
  };
}

function placeMarker(
  map: MapLibreMap,
  label: string,
  coordinates: RideMapViewModel["start"]["coordinates"],
): Marker {
  return new Marker({
    element: createPlaceMarkerElement(label),
    anchor: "bottom",
  })
    .setLngLat(coordinatesToPosition(coordinates))
    .addTo(map);
}

function placeArrow(
  map: MapLibreMap,
  arrow: RideMapViewModel["directionArrows"][number],
): Marker {
  return new Marker({
    element: createDirectionArrowElement(arrow.bearingDeg),
    anchor: "center",
  })
    .setLngLat(coordinatesToPosition(arrow.coordinates))
    .addTo(map);
}
