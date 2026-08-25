import type { Coordinates } from "@/domain/geo/types";
import type { LocatedPosition } from "@/domain/location/types";
import { requestCurrentPosition } from "@/components/ride-form/browser-geolocation";
import { isNativeCapacitorPlatform } from "@/infrastructure/native/platform";
import {
  requestCapacitorCurrentCoordinates,
  requestCapacitorCurrentPosition,
} from "./capacitor-geolocation";
import {
  defaultCapacitorGeolocationApi,
  type ForegroundLocationWatchDeps,
} from "./create-foreground-location-watch";

export type RequestDeviceCoordinatesDeps = Pick<
  ForegroundLocationWatchDeps,
  "isNative" | "capacitor"
> & {
  requestBrowserCoordinates?: () => Promise<Coordinates>;
  requestBrowserPosition?: () => Promise<LocatedPosition>;
};

export async function requestDevicePosition(
  deps: RequestDeviceCoordinatesDeps = {},
): Promise<LocatedPosition> {
  const native = deps.isNative ?? isNativeCapacitorPlatform();
  if (native) {
    return requestCapacitorCurrentPosition(
      deps.capacitor ?? defaultCapacitorGeolocationApi(),
    );
  }
  if (deps.requestBrowserPosition) {
    return deps.requestBrowserPosition();
  }
  if (deps.requestBrowserCoordinates) {
    return {
      coordinates: await deps.requestBrowserCoordinates(),
      accuracyMeters: null,
    };
  }
  return requestCurrentPosition();
}

export async function requestDeviceCoordinates(
  deps: RequestDeviceCoordinatesDeps = {},
): Promise<Coordinates> {
  const native = deps.isNative ?? isNativeCapacitorPlatform();
  if (native) {
    return requestCapacitorCurrentCoordinates(
      deps.capacitor ?? defaultCapacitorGeolocationApi(),
    );
  }
  if (deps.requestBrowserCoordinates) {
    return deps.requestBrowserCoordinates();
  }
  const located = await requestDevicePosition(deps);
  return located.coordinates;
}