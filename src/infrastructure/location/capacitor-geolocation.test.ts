import { describe, expect, it, vi } from "vitest";
import { CurrentPositionError } from "@/components/ride-form/browser-geolocation";
import {
  CAPACITOR_FOREGROUND_POSITION_OPTIONS,
  classifyCapacitorGeolocationError,
  requestCapacitorCurrentCoordinates,
  type CapacitorGeolocationApi,
} from "./capacitor-geolocation";

describe("requestCapacitorCurrentCoordinates (FR-017, FR-027)", () => {
  it("returns high-accuracy coordinates from the plugin", async () => {
    const api: CapacitorGeolocationApi = {
      requestPermissions: vi.fn(async () => ({ location: "granted" })),
      getCurrentPosition: vi.fn(async () => ({
        timestamp: 1,
        coords: { latitude: 45.4, longitude: -72.73, accuracy: 6 },
      })),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    await expect(requestCapacitorCurrentCoordinates(api)).resolves.toEqual({
      latitude: 45.4,
      longitude: -72.73,
    });
    expect(api.getCurrentPosition).toHaveBeenCalledWith(
      CAPACITOR_FOREGROUND_POSITION_OPTIONS,
    );
  });

  it("maps a denied permission", async () => {
    expect(classifyCapacitorGeolocationError("OS-PLUG-GLOC-0003")).toBe(
      "permission_denied",
    );
    const api: CapacitorGeolocationApi = {
      requestPermissions: vi.fn(async () => ({ location: "denied" })),
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    await expect(requestCapacitorCurrentCoordinates(api)).rejects.toEqual(
      new CurrentPositionError("permission_denied"),
    );
    expect(api.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("maps a timeout from the plugin", async () => {
    expect(classifyCapacitorGeolocationError("OS-PLUG-GLOC-0010")).toBe(
      "timeout",
    );
    const api: CapacitorGeolocationApi = {
      getCurrentPosition: vi.fn(async () => {
        throw { code: "OS-PLUG-GLOC-0010" };
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    await expect(requestCapacitorCurrentCoordinates(api)).rejects.toEqual(
      new CurrentPositionError("timeout"),
    );
  });
});
