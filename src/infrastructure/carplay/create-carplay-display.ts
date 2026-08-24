import { isNativeCapacitorPlatform } from "@/infrastructure/native/platform";
import type { CarPlayDisplay } from "./carplay-display";
import { createCapacitorCarPlayDisplay } from "./capacitor-carplay-display";
import { createNoopCarPlayDisplay } from "./noop-carplay-display";
import type { RideCarPlayPlugin } from "./ride-carplay-plugin";

export type CarPlayDisplayDeps = {
  isNative?: boolean;
  plugin?: RideCarPlayPlugin;
};

export function createCarPlayDisplay(
  deps: CarPlayDisplayDeps = {},
): CarPlayDisplay {
  const native = deps.isNative ?? isNativeCapacitorPlatform();
  if (native) {
    return createCapacitorCarPlayDisplay(deps.plugin);
  }
  return createNoopCarPlayDisplay();
}
