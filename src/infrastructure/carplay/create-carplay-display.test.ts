import { describe, expect, it, vi } from "vitest";
import { createCarPlayDisplay } from "./create-carplay-display";
import type { RideCarPlayPlugin } from "./ride-carplay-plugin";

describe("createCarPlayDisplay (FR-028, NFR-007)", () => {
  it("uses the no-op display off the iOS shell", async () => {
    const display = createCarPlayDisplay({ isNative: false });
    await expect(
      display.start({
        routeId: "web",
        coordinates: [],
        userLocation: null,
        headingDeg: null,
        remainingDistanceKm: 0,
        remainingDurationMinutes: 0,
        muted: false,
        lowAccuracy: false,
        cancelSpeech: false,
        maneuver: null,
        speakText: null,
      }),
    ).resolves.toEqual({ connected: false, ownsVoice: false });
  });

  it("uses the Capacitor adapter on the iOS shell", async () => {
    const plugin: RideCarPlayPlugin = {
      start: vi.fn(async () => ({ connected: true, ownsVoice: true })),
      update: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      getConnection: vi.fn(async () => ({ connected: true })),
      addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
    };
    const display = createCarPlayDisplay({ isNative: true, plugin });
    await expect(
      display.start({
        routeId: "native",
        coordinates: [{ latitude: 1, longitude: 2 }],
        userLocation: null,
        headingDeg: null,
        remainingDistanceKm: 1,
        remainingDurationMinutes: 1,
        muted: false,
        lowAccuracy: false,
        cancelSpeech: false,
        maneuver: null,
        speakText: null,
      }),
    ).resolves.toEqual({ connected: true, ownsVoice: true });
    expect(plugin.start).toHaveBeenCalled();
  });
});
