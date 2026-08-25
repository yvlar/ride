import { isNativeCapacitorPlatform } from "@/infrastructure/native/platform";

/**
 * Opens the host app's system settings page on native iOS so the rider can
 * enable location. Browsers cannot open OS location settings (FR-038).
 */
export function openDeviceLocationSettings(
  deps: {
    isNative?: boolean;
    assign?: (url: string) => void;
  } = {},
): boolean {
  const native = deps.isNative ?? isNativeCapacitorPlatform();
  if (!native) {
    return false;
  }
  const assign =
    deps.assign ??
    ((url: string) => {
      if (typeof window !== "undefined") {
        window.location.assign(url);
      }
    });
  assign("app-settings:");
  return true;
}
