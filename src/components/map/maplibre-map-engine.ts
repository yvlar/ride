import { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { coordinatesToPosition } from "@/domain/geo/distance";
import { FALLBACK_MAP_STYLE } from "./fallback-style";
import {
  MAP_UNAVAILABLE_MESSAGE,
  type MapEngine,
  type MapEngineHandle,
} from "./map-engine";
import "./ride-map-markers.css";
import type { RideMapViewModel } from "./ride-map-view-model";

export function createMapLibreEngine(): MapEngine {
  return {
    mount(container, viewModel, { onError }): MapEngineHandle {
      const markers: Marker[] = [];
      let map: MapLibreMap | undefined;

      try {
        map = new MapLibreMap({
          container,
          style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_MAP_STYLE,
          attributionControl: { compact: true },
        });
      } catch {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      }

      map.on("error", () => {
        if (map && !map.isStyleLoaded()) {
          onError(MAP_UNAVAILABLE_MESSAGE);
        }
      });

      map.on("load", () => {
        if (!map) {
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

        map.fitBounds(
          [
            [viewModel.bounds.west, viewModel.bounds.south],
            [viewModel.bounds.east, viewModel.bounds.north],
          ],
          { padding: 48, duration: 0 },
        );
      });

      return {
        destroy() {
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
  const element = document.createElement("div");
  element.className = "ride-map-marker";
  element.textContent = label;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", label);

  return new Marker({ element, anchor: "bottom" })
    .setLngLat(coordinatesToPosition(coordinates))
    .addTo(map);
}

function placeArrow(
  map: MapLibreMap,
  arrow: RideMapViewModel["directionArrows"][number],
): Marker {
  const element = document.createElement("div");
  element.className = "ride-map-arrow";
  element.setAttribute("aria-hidden", "true");
  element.style.transform = `rotate(${arrow.bearingDeg}deg)`;

  return new Marker({ element, anchor: "center" })
    .setLngLat(coordinatesToPosition(arrow.coordinates))
    .addTo(map);
}
