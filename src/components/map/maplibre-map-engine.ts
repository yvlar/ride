import { GeolocateControl, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { coordinatesToPosition } from "@/domain/geo/distance";
import { FALLBACK_MAP_STYLE } from "./fallback-style";
import {
  GPS_TRACKING_UNAVAILABLE_MESSAGE,
  MAP_GEOLOCATE_LABEL,
  MAP_GEOLOCATE_UNAVAILABLE_LABEL,
  RIDE_GEOLOCATE_CONTROL_OPTIONS,
} from "./geolocate-control-options";
import {
  MAP_UNAVAILABLE_MESSAGE,
  type MapEngine,
  type MapEngineHandle,
} from "./map-engine";
import { ensureMapLibreWorkerUrl } from "./maplibre-worker-url";
import {
  createDirectionArrowElement,
  createPlaceMarkerElement,
} from "./ride-map-markers";
import "./ride-map-markers.css";
import { mapCameraFrame, type RideMapViewModel } from "./ride-map-view-model";

export type MapLibreEngineOptions = {
  /** Result maps opt in (FR-022). Navigation maps must stay false (NFR-006). */
  geolocate?: boolean;
};

export function createMapLibreEngine(
  options: MapLibreEngineOptions = {},
): MapEngine {
  const geolocateEnabled = options.geolocate !== false;

  return {
    mount(container, viewModel, { onError, onWarning }): MapEngineHandle {
      const markers: Marker[] = [];
      let map: MapLibreMap | undefined;
      let geolocateControl: GeolocateControl | undefined;
      let disposed = false;

      ensureMapLibreWorkerUrl();
      let camera = mapCameraFrame(viewModel.bounds);
      let currentViewModel = viewModel;

      try {
        map = new MapLibreMap({
          container,
          style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_MAP_STYLE,
          attributionControl: { compact: true },
          bounds: camera.bounds,
          fitBoundsOptions: camera.fitBoundsOptions,
          locale: {
            "GeolocateControl.FindMyLocation": MAP_GEOLOCATE_LABEL,
            "GeolocateControl.LocationNotAvailable":
              MAP_GEOLOCATE_UNAVAILABLE_LABEL,
          },
        });
      } catch {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      }

      // MapLibre reports a missing WebGL2 context through an error event during
      // construction, but still returns a partially initialized Map instance.
      // That instance has no painter and Map#remove() throws when React later
      // unmounts it. Treat it as unavailable before adding controls or handlers.
      if (!map.painter) {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return {
          destroy() {
            const mapToRemove = map;
            map = undefined;
            removeMapSafely(mapToRemove);
          },
        };
      }

      if (geolocateEnabled) {
        geolocateControl = new GeolocateControl(RIDE_GEOLOCATE_CONTROL_OPTIONS);
        map.addControl(geolocateControl, "top-right");
        labelGeolocateControl(container);
        geolocateControl.on("error", () => {
          if (!disposed) {
            onWarning?.(GPS_TRACKING_UNAVAILABLE_MESSAGE);
          }
        });
      }

      map.on("error", () => {
        if (disposed || !map || map.isStyleLoaded()) {
          return;
        }
        onError(MAP_UNAVAILABLE_MESSAGE);
      });

      function renderRoute(
        next: typeof viewModel,
        options: { fitCamera?: boolean } = {},
      ) {
        currentViewModel = next;
        camera = mapCameraFrame(next.bounds);
        if (!map || disposed || !map.isStyleLoaded()) {
          return;
        }

        try {
          const source = map.getSource("ride-route");
          const data = {
            type: "Feature" as const,
            properties: {},
            geometry: next.geometry,
          };
          if (source && "setData" in source && typeof source.setData === "function") {
            source.setData(data);
          } else {
            map.addSource("ride-route", {
              type: "geojson",
              data,
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
          }

          for (const marker of markers) {
            marker.remove();
          }
          markers.length = 0;
          markers.push(placeMarker(map, next.start.label, next.start.coordinates));
          if (next.destination) {
            markers.push(
              placeMarker(
                map,
                next.destination.label,
                next.destination.coordinates,
              ),
            );
          }
          for (const arrow of next.directionArrows) {
            markers.push(placeArrow(map, arrow));
          }

          // The constructor already frames the first view. A second fitBounds
          // during load can throw inside MapLibre's camera ease (NFR-006).
          if (options.fitCamera) {
            map.fitBounds(camera.bounds, camera.fitBoundsOptions);
          }
        } catch {
          onWarning?.(MAP_UNAVAILABLE_MESSAGE);
        }
      }

      map.on("load", () => {
        if (disposed || !map) {
          return;
        }
        renderRoute(currentViewModel);
      });

      let userMarker: Marker | undefined;

      return {
        destroy() {
          disposed = true;
          if (map && geolocateControl) {
            try {
              map.removeControl(geolocateControl);
            } catch {
              geolocateControl.onRemove();
            }
          }
          geolocateControl = undefined;
          userMarker?.remove();
          userMarker = undefined;
          for (const marker of markers) {
            marker.remove();
          }
          markers.length = 0;
          const mapToRemove = map;
          map = undefined;
          removeMapSafely(mapToRemove);
        },
        setViewModel(next) {
          if (disposed) {
            return;
          }
          renderRoute(next, { fitCamera: true });
        },
        setUserLocation(coordinates) {
          if (!map || disposed) {
            return;
          }
          try {
            if (!coordinates) {
              userMarker?.remove();
              userMarker = undefined;
              return;
            }
            if (!userMarker) {
              const element = document.createElement("div");
              element.setAttribute("aria-label", "Position actuelle");
              element.style.width = "16px";
              element.style.height = "16px";
              element.style.borderRadius = "999px";
              element.style.background = "#38bdf8";
              element.style.border = "2px solid white";
              userMarker = new Marker({ element, anchor: "center" }).addTo(map);
            }
            userMarker.setLngLat(coordinatesToPosition(coordinates));
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        recenter() {
          if (!map || disposed) {
            return;
          }
          try {
            if (userMarker) {
              map.easeTo({
                center: userMarker.getLngLat(),
                duration: 400,
              });
              return;
            }
            map.fitBounds(camera.bounds, camera.fitBoundsOptions);
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
      };
    },
  };
}

function removeMapSafely(map: MapLibreMap | undefined): void {
  if (!map) {
    return;
  }
  try {
    map.remove();
  } catch {
    // A failed WebGL2 initialization leaves MapLibre without a painter. Its
    // remove() method currently throws in that state; cleanup must never crash
    // the surrounding React tree.
  }
}

function labelGeolocateControl(container: HTMLElement): void {
  const button = container.querySelector<HTMLButtonElement>(
    ".maplibregl-ctrl-geolocate",
  );
  button?.setAttribute("aria-label", MAP_GEOLOCATE_LABEL);
  button?.setAttribute("title", MAP_GEOLOCATE_LABEL);
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
