import { describe, expect, it, vi } from "vitest";
import type { PluginListenerHandle } from "@capacitor/core";
import { createCapacitorCarPlayDisplay } from "./capacitor-carplay-display";
import type { RideCarPlayPlugin } from "./ride-carplay-plugin";
import type { CarPlaySessionSnapshot } from "./types";

const snapshot: CarPlaySessionSnapshot = {
  routeId: "loop-1",
  coordinates: [{ latitude: 45.4, longitude: -72.7 }],
  userLocation: { latitude: 45.4, longitude: -72.7 },
  headingDeg: 10,
  remainingDistanceKm: 1,
  remainingDurationMinutes: 2,
  muted: false,
  lowAccuracy: false,
  cancelSpeech: false,
  maneuver: null,
  speakText: "Tournez à droite",
};

function mockPlugin(): RideCarPlayPlugin {
  return {
    start: vi.fn(async () => ({ connected: true, ownsVoice: true })),
    update: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    getConnection: vi.fn(async () => ({ connected: false, stopRequested: false })),
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

  it("maps native connection, mute and stop events onto the display port", async () => {
    const listeners: {
      connectionChange?: (event: { connected: boolean }) => void;
      muteChange?: (event: { muted: boolean }) => void;
      stopRequested?: () => void;
    } = {};
    const plugin: RideCarPlayPlugin = {
      start: vi.fn(),
      update: vi.fn(),
      stop: vi.fn(),
      getConnection: vi.fn(async () => ({ connected: false, stopRequested: false })),
      addListener: vi.fn(async (eventName, listener) => {
        if (eventName === "connectionChange") {
          listeners.connectionChange = listener;
        }
        if (eventName === "muteChange") {
          listeners.muteChange = listener;
        }
        if (eventName === "stopRequested") {
          listeners.stopRequested = listener;
        }
        return { remove: vi.fn(async () => {}) };
      }),
    };
    const display = createCapacitorCarPlayDisplay(plugin);
    const received: unknown[] = [];
    const unsubscribe = display.subscribe((event) => {
      received.push(event);
    });

    await vi.waitFor(() => {
      expect(plugin.getConnection).toHaveBeenCalledTimes(1);
      expect(listeners.stopRequested).toBeDefined();
    });
    listeners.connectionChange?.({ connected: true });
    listeners.muteChange?.({ muted: true });
    listeners.stopRequested?.();

    expect(received).toEqual([
      { type: "connection", connected: false },
      { type: "connection", connected: true },
      { type: "mute", muted: true },
      { type: "stop" },
    ]);
    unsubscribe();
  });

  it("attaches listeners before replaying the current connection (FR-028)", async () => {
    const order: string[] = [];
    let resolveConnection: ((handle: PluginListenerHandle) => void) | undefined;
    const plugin: RideCarPlayPlugin = {
      start: vi.fn(),
      update: vi.fn(),
      stop: vi.fn(),
      getConnection: vi.fn(async () => {
        order.push("getConnection");
        return { connected: true, stopRequested: false };
      }),
      addListener: vi.fn(async (eventName) => {
        order.push(`listen:${eventName}`);
        if (eventName === "stopRequested") {
          return new Promise<PluginListenerHandle>((resolve) => {
            resolveConnection = resolve;
          });
        }
        return { remove: vi.fn(async () => {}) };
      }),
    };
    const display = createCapacitorCarPlayDisplay(plugin);
    const received: unknown[] = [];
    display.subscribe((event) => {
      received.push(event);
    });

    await Promise.resolve();
    expect(plugin.getConnection).not.toHaveBeenCalled();
    expect(order).toEqual(["listen:stopRequested"]);

    resolveConnection?.({ remove: vi.fn(async () => {}) });

    await vi.waitFor(() => {
      expect(order).toEqual([
        "listen:stopRequested",
        "listen:muteChange",
        "listen:connectionChange",
        "getConnection",
      ]);
      expect(received).toEqual([{ type: "connection", connected: true }]);
    });
  });

  it("replays a pending Arrêter if stopRequested arrived before listeners attached (FR-028)", async () => {
    const plugin: RideCarPlayPlugin = {
      start: vi.fn(),
      update: vi.fn(),
      stop: vi.fn(),
      getConnection: vi.fn(async () => ({ connected: true, stopRequested: true })),
      addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
    };
    const display = createCapacitorCarPlayDisplay(plugin);
    const received: unknown[] = [];
    display.subscribe((event) => {
      received.push(event);
    });

    await vi.waitFor(() => {
      expect(received).toEqual([
        { type: "connection", connected: true },
        { type: "stop" },
      ]);
    });
  });
});
