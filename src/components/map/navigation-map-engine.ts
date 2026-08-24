import type { Coordinates } from "@/domain/geo/types";
import {
  browserPlatform,
  prefersLightweightNavigationMap,
  type NavigationBrowserPlatform,
} from "./browser-map-platform";
import { createMapLibreEngine } from "./maplibre-map-engine";
import type { MapEngine, MapEngineHandle, MapEngineHandlers } from "./map-engine";
import type { RideMapViewModel } from "./ride-map-view-model";

export type { NavigationBrowserPlatform };

export type NavigationMapHandle = MapEngineHandle & {
  setUserLocation: (
    coordinates: Coordinates | null,
    headingDeg?: number | null,
  ) => void;
  recenter: () => void;
  setViewModel: (viewModel: RideMapViewModel) => void;
};

export type NavigationMapEngine = {
  mount: (
    container: HTMLElement,
    viewModel: RideMapViewModel,
    handlers: MapEngineHandlers,
  ) => NavigationMapHandle;
};

export type NavigationMapEngineOptions = {
  mapLibre?: MapEngine;
  lightweight?: MapEngine;
  platform?: NavigationBrowserPlatform | null;
};

export { prefersLightweightNavigationMap };

export function resolvePlatformMapEngine(
  options: NavigationMapEngineOptions,
  createDefaultMapLibre: () => MapEngine,
): MapEngine {
  const platform =
    options.platform === undefined ? browserPlatform() : options.platform;
  // SVG is opt-in only. Auto-switching iOS to a schematic map made the blue
  // route look detached from the streets (FR-013). Crash avoidance is a
  // single shared MapLibre instance, not a second engine.
  if (options.lightweight && prefersLightweightNavigationMap(platform)) {
    return options.lightweight;
  }
  return options.mapLibre ?? createDefaultMapLibre();
}

export function createNavigationMapEngine(
  options: NavigationMapEngineOptions = {},
): NavigationMapEngine {
  const base = resolvePlatformMapEngine(options, () =>
    createMapLibreEngine({ geolocate: false }),
  );

  return {
    mount(container, viewModel, handlers): NavigationMapHandle {
      const handle = base.mount(container, viewModel, handlers);
      return {
        destroy: handle.destroy,
        setUserLocation(coordinates, headingDeg) {
          handle.setUserLocation?.(coordinates, headingDeg);
        },
        recenter() {
          handle.recenter?.();
        },
        setViewModel(next) {
          handle.setViewModel?.(next);
        },
        resize() {
          handle.resize?.();
        },
        setGeolocateEnabled(enabled) {
          handle.setGeolocateEnabled?.(enabled);
        },
        setFollowUser(enabled) {
          handle.setFollowUser?.(enabled);
        },
      };
    },
  };
}
