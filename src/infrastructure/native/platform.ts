import { Capacitor } from "@capacitor/core";

/**
 * Infrastructure-only detector. Domain code must not import this (NFR-007).
 */
export function isNativeCapacitorPlatform(): boolean {
  return Capacitor.isNativePlatform();
}
