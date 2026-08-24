import { Geolocation } from "@capacitor/geolocation";
import type { LocationWatch } from "@/domain/location/types";
import { isNativeCapacitorPlatform } from "@/infrastructure/native/platform";
import type { BrowserGeolocationApi } from "./browser-location-watch";
import { createBrowserLocationWatch } from "./browser-location-watch";
import type { CapacitorGeolocationApi } from "./capacitor-geolocation";
import { createCapacitorLocationWatch } from "./capacitor-location-watch";

export type ForegroundLocationWatchDeps = {
  isNative?: boolean;
  capacitor?: CapacitorGeolocationApi;
  browser?: BrowserGeolocationApi;
};

export function defaultCapacitorGeolocationApi(): CapacitorGeolocationApi {
  return {
    watchPosition: (options, callback) =>
      Geolocation.watchPosition(options, callback),
    clearWatch: (options) => Geolocation.clearWatch(options),
    getCurrentPosition: (options) => Geolocation.getCurrentPosition(options),
    requestPermissions: () => Geolocation.requestPermissions(),
  };
}

/**
 * Picks the Capacitor GPS adapter on iOS, otherwise the browser watch (NFR-007).
 */
export function createForegroundLocationWatch(
  deps: ForegroundLocationWatchDeps = {},
): LocationWatch {
  const native = deps.isNative ?? isNativeCapacitorPlatform();
  if (native) {
    return createCapacitorLocationWatch(
      deps.capacitor ?? defaultCapacitorGeolocationApi(),
    );
  }
  return createBrowserLocationWatch(deps.browser);
}
