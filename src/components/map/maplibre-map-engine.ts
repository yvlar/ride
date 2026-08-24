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
  createUserPuckElement,
} from "./ride-map-markers";
import "./ride-map-markers.css";
import { mapCameraFrame, type RideMapViewModel } from "./ride-map-view-model";

/** Street-map follow camera while GeolocateControl is off (FR-024, FR-028). */
export const NAVIGATION_FOLLOW_ZOOM = 16;
export const NAVIGATION_FOLLOW_PITCH = 45;
export const NAVIGATION_FOLLOW_DURATION_MS = 400;
export const NAVIGATION_FOLLOW_PADDING = {
  top: 160,
  bottom: 200,
  left: 40,
  right: 40,
} as const;

export type MapLibreEngineOptions = {
  /** Result maps opt in (FR-022). Navigation maps must stay false (NFR-006). */
  geolocate?: boolean;
};

export function createMapLibreEngine(
  options: MapLibreEngineOptions = {},
): MapEngine {
  const geolocateAllowed = options.geolocate !== false;

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

      function attachGeolocateControl() {
        if (!map || disposed || geolocateControl || !geolocateAllowed) {
          return;
        }
        geolocateControl = new GeolocateControl(RIDE_GEOLOCATE_CONTROL_OPTIONS);
        map.addControl(geolocateControl, "top-right");
        labelGeolocateControl(container);
        geolocateControl.on("error", () => {
          if (!disposed) {
            onWarning?.(GPS_TRACKING_UNAVAILABLE_MESSAGE);
          }
        });
      }

      function detachGeolocateControl() {
        if (!geolocateControl) {
          return;
        }
        if (map) {
          try {
            map.removeControl(geolocateControl);
          } catch {
            geolocateControl.onRemove();
          }
        } else {
          geolocateControl.onRemove();
        }
        geolocateControl = undefined;
      }

      attachGeolocateControl();

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
      let followUser = false;
      let lastHeadingDeg: number | null = null;

      function applyUserPuckHeading(headingDeg: number | null | undefined) {
        if (!userMarker) {
          return;
        }
        if (typeof headingDeg !== "number" || !Number.isFinite(headingDeg)) {
          return;
        }
        lastHeadingDeg = ((headingDeg % 360) + 360) % 360;
        userMarker.setRotationAlignment("map");
        userMarker.setPitchAlignment("viewport");
        userMarker.setRotation(lastHeadingDeg);
      }

      function applyFollowCamera() {
        if (!followUser || !map || disposed || !userMarker) {
          return;
        }
        const camera: {
          center: ReturnType<Marker["getLngLat"]>;
          zoom: number;
          padding: typeof NAVIGATION_FOLLOW_PADDING;
          duration: number;
          essential: boolean;
          bearing?: number;
          pitch?: number;
        } = {
          center: userMarker.getLngLat(),
          zoom: NAVIGATION_FOLLOW_ZOOM,
          padding: NAVIGATION_FOLLOW_PADDING,
          duration: NAVIGATION_FOLLOW_DURATION_MS,
          essential: true,
        };
        if (lastHeadingDeg != null && Number.isFinite(lastHeadingDeg)) {
          camera.bearing = lastHeadingDeg;
          camera.pitch = NAVIGATION_FOLLOW_PITCH;
        }
        map.easeTo(camera);
      }

      function onUserCameraInteraction(event?: { originalEvent?: Event }) {
        if (event?.originalEvent) {
          followUser = false;
        }
      }

      map.on("dragstart", onUserCameraInteraction);
      map.on("zoomstart", onUserCameraInteraction);
      map.on("rotatestart", onUserCameraInteraction);
      map.on("pitchstart", onUserCameraInteraction);

      return {
        destroy() {
          disposed = true;
          detachGeolocateControl();
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
          renderRoute(next, { fitCamera: !followUser });
        },
        resize() {
          if (!map || disposed) {
            return;
          }
          try {
            map.resize();
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        setUserLocation(coordinates, headingDeg) {
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
              userMarker = new Marker({
                element: createUserPuckElement(),
                anchor: "center",
                rotationAlignment: "map",
                pitchAlignment: "viewport",
              }).addTo(map);
            }
            userMarker.setLngLat(coordinatesToPosition(coordinates));
            applyUserPuckHeading(headingDeg);
            applyFollowCamera();
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        setGeolocateEnabled(enabled) {
          if (disposed) {
            return;
          }
          if (enabled) {
            attachGeolocateControl();
            return;
          }
          detachGeolocateControl();
        },
        setFollowUser(enabled) {
          if (disposed) {
            return;
          }
          followUser = enabled;
          if (enabled) {
            try {
              applyFollowCamera();
            } catch {
              onWarning?.(MAP_UNAVAILABLE_MESSAGE);
            }
          }
        },
        recenter() {
          if (!map || disposed) {
            return;
          }
          try {
            followUser = true;
            if (userMarker) {
              applyFollowCamera();
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
