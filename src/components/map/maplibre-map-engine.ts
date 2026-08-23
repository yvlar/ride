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

export function createMapLibreEngine(): MapEngine {
  return {
    mount(container, viewModel, { onError, onWarning }): MapEngineHandle {
      const markers: Marker[] = [];
      let map: MapLibreMap | undefined;
      let geolocateControl: GeolocateControl | undefined;
      let disposed = false;

      ensureMapLibreWorkerUrl();
      const camera = mapCameraFrame(viewModel.bounds);

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

      geolocateControl = new GeolocateControl(RIDE_GEOLOCATE_CONTROL_OPTIONS);
      map.addControl(geolocateControl, "top-right");
      labelGeolocateControl(container);
      geolocateControl.on("error", () => {
        if (!disposed) {
          onWarning?.(GPS_TRACKING_UNAVAILABLE_MESSAGE);
        }
      });

      map.on("error", () => {
        if (disposed || !map || map.isStyleLoaded()) {
          return;
        }
        onError(MAP_UNAVAILABLE_MESSAGE);
      });

      map.on("load", () => {
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
      });

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
          for (const marker of markers) {
            marker.remove();
          }
          markers.length = 0;
          map?.remove();
          map = undefined;
        },
      };
    },
  };
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
