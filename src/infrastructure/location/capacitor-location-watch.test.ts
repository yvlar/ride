import { describe, expect, it, vi } from "vitest";
import { CAPACITOR_FOREGROUND_POSITION_OPTIONS } from "./capacitor-geolocation";
import { createCapacitorLocationWatch } from "./capacitor-location-watch";
import type { CapacitorGeolocationApi, CapacitorPosition } from "./capacitor-geolocation";

function fakeCapacitorGeolocation() {
  let nextId = 1;
  const watches = new Map<
    string,
    (position: CapacitorPosition | null, err?: string) => void
  >();
  const api: CapacitorGeolocationApi = {
    requestPermissions: vi.fn(async () => ({ location: "granted" })),
    watchPosition: vi.fn(async (_options, callback) => {
      const id = String(nextId);
      nextId += 1;
      watches.set(id, callback);
      return id;
    }),
    clearWatch: vi.fn(async ({ id }) => {
      watches.delete(id);
    }),
    getCurrentPosition: vi.fn(),
  };
  return { api, watches };
}

const granby: CapacitorPosition = {
  timestamp: 1,
  coords: {
    latitude: 45.4,
    longitude: -72.7,
    accuracy: 8,
    heading: null,
    speed: null,
  },
};

describe("createCapacitorLocationWatch (FR-022, FR-023, FR-027, NFR-006)", () => {
  it("starts a single plugin watch for several listeners", async () => {
    const { api } = fakeCapacitorGeolocation();
    const watch = createCapacitorLocationWatch(api);
    const first = watch.subscribe(() => {});
    const second = watch.subscribe(() => {});

    await vi.waitFor(() => {
      expect(api.watchPosition).toHaveBeenCalledTimes(1);
    });
    expect(api.watchPosition).toHaveBeenCalledWith(
      CAPACITOR_FOREGROUND_POSITION_OPTIONS,
      expect.any(Function),
    );
    expect(watch.activeNativeWatches()).toBe(1);

    first();
    expect(api.clearWatch).not.toHaveBeenCalled();
    second();
    await vi.waitFor(() => {
      expect(api.clearWatch).toHaveBeenCalledTimes(1);
    });
    expect(watch.activeNativeWatches()).toBe(0);
  });

  it("starts watchPosition from start() before any subscriber (FR-023)", async () => {
    const { api } = fakeCapacitorGeolocation();
    const watch = createCapacitorLocationWatch(api);
    watch.start();
    await vi.waitFor(() => {
      expect(api.watchPosition).toHaveBeenCalledTimes(1);
    });
    watch.subscribe(() => {});
    expect(api.watchPosition).toHaveBeenCalledTimes(1);
  });

  it("replays the last GPS event to a late subscriber (FR-023)", async () => {
    const { api, watches } = fakeCapacitorGeolocation();
    const watch = createCapacitorLocationWatch(api);
    watch.start();
    await vi.waitFor(() => {
      expect(watches.size).toBe(1);
    });
    const [firstWatch] = watches.values();
    firstWatch?.(granby);

    const listener = vi.fn();
    watch.subscribe(listener);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "fix",
        fix: expect.objectContaining({
          coordinates: { latitude: 45.4, longitude: -72.7 },
        }),
      }),
    );
  });

  it("maps a denied permission without starting a watch (FR-017, FR-027)", async () => {
    const { api } = fakeCapacitorGeolocation();
    api.requestPermissions = vi.fn(async () => ({ location: "denied" }));
    const listener = vi.fn();
    createCapacitorLocationWatch(api).subscribe(listener);

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          error: expect.objectContaining({ code: "PERMISSION_DENIED" }),
        }),
      );
    });
    expect(api.watchPosition).not.toHaveBeenCalled();
  });

  it("delivers a plugin error once (FR-023)", async () => {
    const api: CapacitorGeolocationApi = {
      requestPermissions: async () => ({ location: "granted" }),
      watchPosition: async () => {
        throw { code: "OS-PLUG-GLOC-0007", message: "Location services are not enabled." };
      },
      clearWatch: vi.fn(async () => {}),
      getCurrentPosition: vi.fn(),
    };
    const listener = vi.fn();
    createCapacitorLocationWatch(api).subscribe(listener);
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1);
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ code: "POSITION_UNAVAILABLE" }),
      }),
    );
  });
});
