import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { coordinatesToPosition } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { FALLBACK_MAP_STYLE } from "./fallback-style";
import { MAP_UNAVAILABLE_MESSAGE } from "./map-engine";
import { ensureMapLibreWorkerUrl } from "./maplibre-worker-url";
import {
  createPlaceMarkerElement,
  createUserPuckElement,
} from "./ride-map-markers";
import "./ride-map-markers.css";
import type {
  DestinationPickerMapEngine,
} from "./destination-picker-map-engine";

const LONG_PRESS_MS = 550;

export function createMapLibreDestinationPickerEngine(): DestinationPickerMapEngine {
  return {
    mount(container, options, { onPick, onError }) {
      ensureMapLibreWorkerUrl();
      let map: MapLibreMap | undefined;
      let destinationMarker: Marker | undefined;
      let userMarker: Marker | undefined;
      let disposed = false;
      let longPressTimer: ReturnType<typeof setTimeout> | undefined;
      let lastLongPressAt = 0;

      try {
        const common = {
          container,
          style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_MAP_STYLE,
          attributionControl: { compact: true } as const,
        };
        map = options.initialBounds
          ? new MapLibreMap({
              ...common,
              bounds: [
                [options.initialBounds.west, options.initialBounds.south],
                [options.initialBounds.east, options.initialBounds.north],
              ],
              fitBoundsOptions: { padding: 48, duration: 0 },
            })
          : new MapLibreMap({
              ...common,
              center: coordinatesToPosition(options.center),
              zoom: options.initialDestination ? 14 : 11,
            });
      } catch {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      }

      if (!map.painter) {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return {
          destroy() {
            const current = map;
            map = undefined;
            removeMapSafely(current);
          },
        };
      }

      function clearLongPress() {
        if (longPressTimer !== undefined) {
          clearTimeout(longPressTimer);
          longPressTimer = undefined;
        }
      }

      function setDestination(coordinates: Coordinates, notify: boolean) {
        if (!map || disposed) {
          return;
        }
        if (!destinationMarker) {
          destinationMarker = new Marker({
            element: createPlaceMarkerElement("Destination"),
            anchor: "bottom",
            draggable: true,
          })
            .setLngLat(coordinatesToPosition(coordinates))
            .addTo(map);
          destinationMarker.on("dragend", () => {
            if (!destinationMarker || disposed) {
              return;
            }
            const point = destinationMarker.getLngLat();
            onPick({ latitude: point.lat, longitude: point.lng });
          });
        } else {
          destinationMarker.setLngLat(coordinatesToPosition(coordinates));
        }
        if (notify) {
          onPick(coordinates);
        }
      }

      if (options.userLocation) {
        userMarker = new Marker({
          element: createUserPuckElement(),
          anchor: "center",
        })
          .setLngLat(coordinatesToPosition(options.userLocation))
          .addTo(map);
      }
      if (options.initialDestination) {
        setDestination(options.initialDestination.coordinates, false);
      }

      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => {
        if (!disposed && map && !map.isStyleLoaded()) {
          onError(MAP_UNAVAILABLE_MESSAGE);
        }
      });
      map.on("click", (event) => {
        if (Date.now() - lastLongPressAt < LONG_PRESS_MS) {
          return;
        }
        setDestination(
          { latitude: event.lngLat.lat, longitude: event.lngLat.lng },
          true,
        );
      });
      map.on("touchstart", (event) => {
        clearLongPress();
        const point = event.lngLats[0];
        if (!point) {
          return;
        }
        longPressTimer = setTimeout(() => {
          lastLongPressAt = Date.now();
          setDestination(
            { latitude: point.lat, longitude: point.lng },
            true,
          );
        }, LONG_PRESS_MS);
      });
      map.on("touchmove", clearLongPress);
      map.on("touchend", clearLongPress);

      return {
        destroy() {
          disposed = true;
          clearLongPress();
          destinationMarker?.remove();
          destinationMarker = undefined;
          userMarker?.remove();
          userMarker = undefined;
          const current = map;
          map = undefined;
          removeMapSafely(current);
        },
      };
    },
  };
}

function removeMapSafely(map: MapLibreMap | undefined) {
  if (!map) {
    return;
  }
  try {
    map.remove();
  } catch {
    // A failed WebGL initialization can leave a partially constructed map.
  }
}
