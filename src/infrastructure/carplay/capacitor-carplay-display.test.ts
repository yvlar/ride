import { describe, expect, it, vi } from "vitest";
import { createCapacitorCarPlayDisplay } from "./capacitor-carplay-display";
import type { RideCarPlayPlugin } from "./ride-carplay-plugin";
import type { CarPlaySessionSnapshot } from "./types";

const snapshot: CarPlaySessionSnapshot = {
  coordinates: [{ latitude: 45.4, longitude: -72.7 }],
  userLocation: { latitude: 45.4, longitude: -72.7 },
  headingDeg: 10,
  remainingDistanceKm: 1,
  remainingDurationMinutes: 2,
  muted: false,
  lowAccuracy: false,
  maneuver: null,
  speakText: "Tournez à droite",
};

function mockPlugin(): RideCarPlayPlugin {
  return {
    start: vi.fn(async () => ({ connected: true, ownsVoice: true })),
    update: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
  };
}

describe("createCapacitorCarPlayDisplay (FR-028, NFR-007)", () => {
  it("forwards start, update and stop to the native plugin", async () => {
    const plugin = mockPlugin();
    const display = createCapacitorCarPlayDisplay(plugin);

    await expect(display.start(snapshot)).resolves.toEqual({
      connected: true,
      ownsVoice: true,
    });
    await display.update(snapshot);
    await display.stop();

    expect(plugin.start).toHaveBeenCalledWith(snapshot);
    expect(plugin.update).toHaveBeenCalledWith(snapshot);
    expect(plugin.stop).toHaveBeenCalledTimes(1);
  });

  it("maps native connection and mute events onto the display port", async () => {
    const listeners = new Map<string, (payload: { connected?: boolean; muted?: boolean }) => void>();
    const plugin: RideCarPlayPlugin = {
      start: vi.fn(),
      update: vi.fn(),
      stop: vi.fn(),
      addListener: vi.fn(async (eventName, listener) => {
        listeners.set(eventName, listener);
        return { remove: vi.fn(async () => {}) };
      }),
    };
    const display = createCapacitorCarPlayDisplay(plugin);
    const received: unknown[] = [];
    const unsubscribe = display.subscribe((event) => {
      received.push(event);
    });

    await vi.waitFor(() => {
      expect(listeners.size).toBe(2);
    });
    listeners.get("connectionChange")?.({ connected: true });
    listeners.get("muteChange")?.({ muted: true });

    expect(received).toEqual([
      { type: "connection", connected: true },
      { type: "mute", muted: true },
    ]);
    unsubscribe();
  });
});
