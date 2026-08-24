import type { Coordinates } from "@/domain/geo/types";
import { requestCurrentCoordinates } from "@/components/ride-form/browser-geolocation";
import { isNativeCapacitorPlatform } from "@/infrastructure/native/platform";
import { requestCapacitorCurrentCoordinates } from "./capacitor-geolocation";
import {
  defaultCapacitorGeolocationApi,
  type ForegroundLocationWatchDeps,
} from "./create-foreground-location-watch";

export type RequestDeviceCoordinatesDeps = Pick<
  ForegroundLocationWatchDeps,
  "isNative" | "capacitor"
> & {
  requestBrowserCoordinates?: () => Promise<Coordinates>;
};

export async function requestDeviceCoordinates(
  deps: RequestDeviceCoordinatesDeps = {},
): Promise<Coordinates> {
  const native = deps.isNative ?? isNativeCapacitorPlatform();
  if (native) {
    return requestCapacitorCurrentCoordinates(
      deps.capacitor ?? defaultCapacitorGeolocationApi(),
    );
  }
  return (deps.requestBrowserCoordinates ?? requestCurrentCoordinates)();
}