import { GeolocateControl, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { coordinatesToPosition } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
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
import { addRideBuildingExtrusions } from "./map-3d-buildings";
import { ensureMapLibreWorkerUrl } from "./maplibre-worker-url";
import {
  NAVIGATION_FOLLOW_DURATION_MS,
  NAVIGATION_MAX_PITCH,
  finiteHeadingDeg,
  navigationFollowCamera,
} from "./navigation-follow-camera";
import {
  createDirectionArrowElement,
  createPlaceMarkerElement,
  createUserPuckElement,
  enhanceGeolocateDotWithMotorcycle,
  headingFromGeolocateEvent,
} from "./ride-map-markers";
import "./ride-map-markers.css";
import { mapCameraFrame, type RideMapViewModel } from "./ride-map-view-model";

export {
  NAVIGATION_FOLLOW_DURATION_MS,
  NAVIGATION_FOLLOW_PADDING,
  NAVIGATION_FOLLOW_PITCH,
  NAVIGATION_FOLLOW_ZOOM,
  NAVIGATION_MAX_PITCH,
} from "./navigation-follow-camera";

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
      let lastGeolocateHeadingDeg: number | null = null;

      ensureMapLibreWorkerUrl();
      let camera = mapCameraFrame(viewModel.bounds);
      let currentViewModel = viewModel;

      try {
        map = new MapLibreMap({
          container,
          style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_MAP_STYLE,
          attributionControl: { compact: true },
          bounds: camera.bounds,
          fitBoundsOptions: {
            ...camera.fitBoundsOptions,
            pitch: 0,
            bearing: 0,
          },
          maxPitch: NAVIGATION_MAX_PITCH,
          pitch: 0,
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
        geolocateControl.on("geolocate", (event) => {
          if (disposed) {
            return;
          }
          const heading = headingFromGeolocateEvent(event);
          if (heading != null) {
            lastGeolocateHeadingDeg = heading;
          }
          const dot = container.querySelector<HTMLElement>(
            ".maplibregl-user-location-dot",
          );
          if (!dot) {
            return;
          }
          enhanceGeolocateDotWithMotorcycle(dot, lastGeolocateHeadingDeg);
        });
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
          if (!next.idle) {
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
          }

          // The constructor already frames the first view. A second fitBounds
          // during load can throw inside MapLibre's camera ease (NFR-006).
          if (options.fitCamera) {
            map.fitBounds(camera.bounds, overviewFitBoundsOptions(camera));
          }
        } catch {
          onWarning?.(MAP_UNAVAILABLE_MESSAGE);
        }
      }

      map.on("load", () => {
        if (disposed || !map) {
          return;
        }
        try {
          addRideBuildingExtrusions(map);
        } catch {
          // Optional 3D buildings must not take down the street map (NFR-005).
        }
        renderRoute(currentViewModel);
      });

      let userMarker: Marker | undefined;
      let followUser = false;
      let streetCameraActive = false;
      let lastUserCoordinates: Coordinates | null = null;
      let lastHeadingDeg: number | null = null;

      function applyUserPuckHeading(headingDeg: number | null) {
        if (!userMarker || headingDeg == null) {
          return;
        }
        userMarker.setRotationAlignment("map");
        userMarker.setPitchAlignment("viewport");
        userMarker.setRotation(headingDeg);
      }

      function applyFollowCamera() {
        if (!followUser || !map || disposed || !lastUserCoordinates) {
          return;
        }
        map.easeTo(
          navigationFollowCamera(lastUserCoordinates, lastHeadingDeg),
        );
        streetCameraActive = true;
      }

      function applyOverviewCamera() {
        if (!map || disposed) {
          return;
        }
        map.fitBounds(camera.bounds, {
          ...overviewFitBoundsOptions(camera),
          duration: NAVIGATION_FOLLOW_DURATION_MS,
        });
        streetCameraActive = false;
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
              lastUserCoordinates = null;
              userMarker?.remove();
              userMarker = undefined;
              return;
            }
            lastUserCoordinates = coordinates;
            lastHeadingDeg = finiteHeadingDeg(headingDeg) ?? lastHeadingDeg;
            const lngLat = coordinatesToPosition(coordinates);
            if (!userMarker) {
              userMarker = new Marker({
                element: createUserPuckElement(),
                anchor: "center",
                rotationAlignment: "map",
                pitchAlignment: "viewport",
              })
                .setLngLat(lngLat)
                .addTo(map);
            } else {
              userMarker.setLngLat(lngLat);
            }
            applyUserPuckHeading(lastHeadingDeg);
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
          try {
            if (enabled) {
              applyFollowCamera();
              return;
            }
            // A pan already clears followUser, but stop still must restore
            // the top-down route frame (FR-013, FR-023).
            if (streetCameraActive) {
              applyOverviewCamera();
            }
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        recenter() {
          if (!map || disposed) {
            return;
          }
          try {
            followUser = true;
            if (lastUserCoordinates) {
              applyFollowCamera();
              return;
            }
            applyOverviewCamera();
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        overview() {
          if (!map || disposed) {
            return;
          }
          try {
            followUser = false;
            applyOverviewCamera();
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

function overviewFitBoundsOptions(frame: ReturnType<typeof mapCameraFrame>) {
  return {
    ...frame.fitBoundsOptions,
    pitch: 0,
    bearing: 0,
  };
}

function placeArrow(
  map: MapLibreMap,
  arrow: RideMapViewModel["directionArrows"][number],
): Marker {
  return new Marker({
    element: createDirectionArrowElement(0),
    anchor: "center",
    rotationAlignment: "map",
    pitchAlignment: "map",
    rotation: arrow.bearingDeg,
  })
    .setLngLat(coordinatesToPosition(arrow.coordinates))
    .addTo(map);
}
