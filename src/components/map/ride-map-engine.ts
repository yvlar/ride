import { resolvePlatformMapEngine, type NavigationMapEngineOptions } from "./navigation-map-engine";
import { createMapLibreEngine } from "./maplibre-map-engine";
import type { MapEngine } from "./map-engine";

export function createRideMapEngine(
  options: NavigationMapEngineOptions = {},
): MapEngine {
  return resolvePlatformMapEngine(options, () => createMapLibreEngine());
}
