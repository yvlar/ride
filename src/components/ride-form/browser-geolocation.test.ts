import { describe, expect, it, vi } from "vitest";
import {
  CURRENT_POSITION_OPTIONS,
  CurrentPositionError,
  GEOLOCATION_ERROR_MESSAGES,
  classifyGeolocationError,
  requestCurrentCoordinates,
  requestCurrentPosition,
} from "./browser-geolocation";

describe("requestCurrentCoordinates (FR-017)", () => {
  it("rejects when geolocation is unsupported", async () => {
    await expect(requestCurrentCoordinates(undefined)).rejects.toMatchObject({
      reason: "unsupported",
      message: GEOLOCATION_ERROR_MESSAGES.unsupported,
    });
  });

  it("maps a permission denial", async () => {
    expect(classifyGeolocationError({ code: 1 })).toBe("permission_denied");

    const geolocation = {
      getCurrentPosition: vi.fn((_success, error) => {
        error?.({ code: 1, message: "denied", PERMISSION_DENIED: 1 });
      }),
    };

    await expect(
      requestCurrentCoordinates(geolocation as unknown as Geolocation),
    ).rejects.toEqual(
      new CurrentPositionError("permission_denied"),
    );
  });

  it("maps a timeout", async () => {
    expect(classifyGeolocationError({ code: 3 })).toBe("timeout");

    const geolocation = {
      getCurrentPosition: vi.fn((_success, error) => {
        error?.({ code: 3, message: "timeout", TIMEOUT: 3 });
      }),
    };

    await expect(
      requestCurrentCoordinates(geolocation as unknown as Geolocation),
    ).rejects.toEqual(new CurrentPositionError("timeout"));
  });

  it("maps an unavailable position", async () => {
    expect(classifyGeolocationError({ code: 2 })).toBe("position_unavailable");
  });

  it("returns coordinates with high-accuracy options", async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((success) => {
        success?.({
          coords: { latitude: 45.4, longitude: -72.73, accuracy: 7 },
        });
      }),
    };

    await expect(
      requestCurrentCoordinates(geolocation as unknown as Geolocation),
    ).resolves.toEqual({ latitude: 45.4, longitude: -72.73 });
    await expect(
      requestCurrentPosition(geolocation as unknown as Geolocation),
    ).resolves.toEqual({
      coordinates: { latitude: 45.4, longitude: -72.73 },
      accuracyMeters: 7,
    });
    expect(geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      CURRENT_POSITION_OPTIONS,
    );
  });
});
