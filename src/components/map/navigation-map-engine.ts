import type { Coordinates } from "@/domain/geo/types";
import { createLightweightNavigationMapEngine } from "./lightweight-navigation-map-engine";
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

export type NavigationBrowserPlatform = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

export type NavigationMapEngineOptions = {
  mapLibre?: MapEngine;
  lightweight?: MapEngine;
  platform?: NavigationBrowserPlatform | null;
};

/**
 * MapLibre 5.24 can retain enough WebGL memory to terminate Safari's WebView
 * process on iOS (maplibre/maplibre-gl-js#7667). Starting navigation replaces
 * the preview map, so avoid allocating a second WebGL map on affected devices.
 */
export function prefersLightweightNavigationMap(
  platform: NavigationBrowserPlatform | null,
): boolean {
  if (!platform) {
    return false;
  }
  if (/iPad|iPhone|iPod/i.test(platform.userAgent)) {
    return true;
  }
  return (
    platform.platform === "MacIntel" && (platform.maxTouchPoints ?? 0) > 1
  );
}

export function createNavigationMapEngine(
  options: NavigationMapEngineOptions = {},
): NavigationMapEngine {
  const platform =
    options.platform === undefined ? browserPlatform() : options.platform;
  const base = prefersLightweightNavigationMap(platform)
    ? (options.lightweight ?? createLightweightNavigationMapEngine())
    : (options.mapLibre ?? createMapLibreEngine({ geolocate: false }));

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

function browserPlatform(): NavigationBrowserPlatform | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}
