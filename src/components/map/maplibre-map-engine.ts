import { Map as MapLibreMap, Marker } from "maplibre-gl";
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

export function createMapLibreEngine(): MapEngine {
  return {
    mount(container, viewModel, { onError }): MapEngineHandle {
      const markers: Marker[] = [];
      let map: MapLibreMap | undefined;
      let disposed = false;

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
        onError(MAP_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      }

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
