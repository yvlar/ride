import { describe, expect, it, vi } from "vitest";
import { createForegroundLocationWatch } from "./create-foreground-location-watch";
import { requestDeviceCoordinates, requestDevicePosition } from "./request-device-coordinates";
import type { CapacitorGeolocationApi } from "./capacitor-geolocation";

describe("createForegroundLocationWatch (FR-027, NFR-007)", () => {
  it("uses the browser watch when the runtime is not native", () => {
    const browser = {
      watchPosition: vi.fn(() => 1),
      clearWatch: vi.fn(),
    };
    const watch = createForegroundLocationWatch({
      isNative: false,
      browser,
    });
    watch.start();
    expect(browser.watchPosition).toHaveBeenCalledTimes(1);
  });

  it("uses the Capacitor watch on the iOS shell", async () => {
    const capacitor: CapacitorGeolocationApi = {
      requestPermissions: vi.fn(async () => ({ location: "granted" })),
      watchPosition: vi.fn(async () => "cap-1"),
      clearWatch: vi.fn(async () => {}),
      getCurrentPosition: vi.fn(),
    };
    const watch = createForegroundLocationWatch({
      isNative: true,
      capacitor,
    });
    watch.start();
    await vi.waitFor(() => {
      expect(capacitor.watchPosition).toHaveBeenCalledTimes(1);
    });
  });
});

describe("requestDeviceCoordinates (FR-017, FR-027)", () => {
  it("delegates to the browser on web", async () => {
    const requestBrowserCoordinates = vi.fn(async () => ({
      latitude: 1,
      longitude: 2,
    }));
    await expect(
      requestDeviceCoordinates({ isNative: false, requestBrowserCoordinates }),
    ).resolves.toEqual({ latitude: 1, longitude: 2 });
  });

  it("returns accuracy from a one-shot position (FR-034)", async () => {
    const requestBrowserPosition = vi.fn(async () => ({
      coordinates: { latitude: 1, longitude: 2 },
      accuracyMeters: 6,
    }));
    await expect(
      requestDevicePosition({ isNative: false, requestBrowserPosition }),
    ).resolves.toEqual({
      coordinates: { latitude: 1, longitude: 2 },
      accuracyMeters: 6,
    });
  });

  it("delegates to Capacitor on the iOS shell", async () => {
    const capacitor: CapacitorGeolocationApi = {
      requestPermissions: vi.fn(async () => ({ location: "granted" })),
      getCurrentPosition: vi.fn(async () => ({
        timestamp: 1,
        coords: { latitude: 45.4, longitude: -72.7, accuracy: 5 },
      })),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    await expect(
      requestDeviceCoordinates({ isNative: true, capacitor }),
    ).resolves.toEqual({ latitude: 45.4, longitude: -72.7 });
  });
});
