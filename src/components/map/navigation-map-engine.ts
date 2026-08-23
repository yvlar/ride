import type { Coordinates } from "@/domain/geo/types";
import { createMapLibreEngine } from "./maplibre-map-engine";
import type { MapEngine, MapEngineHandle, MapEngineHandlers } from "./map-engine";
import type { RideMapViewModel } from "./ride-map-view-model";

export type NavigationMapHandle = MapEngineHandle & {
  setUserLocation: (coordinates: Coordinates | null) => void;
  recenter: () => void;
};

export type NavigationMapEngine = {
  mount: (
    container: HTMLElement,
    viewModel: RideMapViewModel,
    handlers: MapEngineHandlers,
  ) => NavigationMapHandle;
};

export function createNavigationMapEngine(
  base: MapEngine = createMapLibreEngine({ geolocate: false }),
): NavigationMapEngine {
  return {
    mount(container, viewModel, handlers): NavigationMapHandle {
      const handle = base.mount(container, viewModel, handlers);
      return {
        destroy: handle.destroy,
        setUserLocation(coordinates) {
          handle.setUserLocation?.(coordinates);
        },
        recenter() {
          handle.recenter?.();
        },
      };
    },
  };
}
