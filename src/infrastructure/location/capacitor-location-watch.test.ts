import { describe, expect, it, vi } from "vitest";
import { CAPACITOR_FOREGROUND_POSITION_OPTIONS } from "./capacitor-geolocation";
import { createCapacitorLocationWatch } from "./capacitor-location-watch";
import type {
  CapacitorGeolocationApi,
  CapacitorPosition,
  CapacitorWatchCallback,
} from "./capacitor-geolocation";

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

function deferredCapacitorGeolocation(options?: { deferPermissions?: boolean }) {
  let nextId = 1;
  const permissionWaiters: Array<(value: { location: string }) => void> = [];
  const watchWaiters: Array<(id: string) => void> = [];
  const watches = new Map<string, CapacitorWatchCallback>();
  const api: CapacitorGeolocationApi = {
    requestPermissions: vi.fn(() => {
      if (options?.deferPermissions) {
        return new Promise<{ location: string }>((resolve) => {
          permissionWaiters.push(resolve);
        });
      }
      return Promise.resolve({ location: "granted" });
    }),
    watchPosition: vi.fn((_watchOptions, callback) => {
      return new Promise<string>((resolve) => {
        watchWaiters.push((id) => {
          watches.set(id, callback);
          resolve(id);
        });
      });
    }),
    clearWatch: vi.fn(async ({ id }) => {
      watches.delete(id);
    }),
    getCurrentPosition: vi.fn(),
  };
  return {
    api,
    watches,
    grantPermissions(location = "granted") {
      for (const resolve of permissionWaiters.splice(0)) {
        resolve({ location });
      }
    },
    resolveNextWatch() {
      const id = String(nextId);
      nextId += 1;
      watchWaiters.shift()?.(id);
      return id;
    },
    pendingWatchCount() {
      return watchWaiters.length;
    },
    pendingPermissionCount() {
      return permissionWaiters.length;
    },
  };
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

  it("keeps the start() plugin watch until a subscriber attaches (FR-023)", async () => {
    const deferred = deferredCapacitorGeolocation();
    const watch = createCapacitorLocationWatch(deferred.api);
    watch.start();
    await vi.waitFor(() => {
      expect(deferred.pendingWatchCount()).toBe(1);
    });

    deferred.resolveNextWatch();
    await vi.waitFor(() => {
      expect(watch.activeNativeWatches()).toBe(1);
    });

    expect(deferred.api.clearWatch).not.toHaveBeenCalled();
    expect(deferred.watches.size).toBe(1);
    expect(watch.activeNativeWatches()).toBe(1);
  });

  it("clears the plugin watch when the last subscriber leaves before watchPosition resolves (FR-023, NFR-006)", async () => {
    const deferred = deferredCapacitorGeolocation();
    const watch = createCapacitorLocationWatch(deferred.api);
    const unsubscribe = watch.subscribe(() => {});

    await vi.waitFor(() => {
      expect(deferred.pendingWatchCount()).toBe(1);
    });
    unsubscribe();

    const id = deferred.resolveNextWatch();
    await vi.waitFor(() => {
      expect(deferred.api.clearWatch).toHaveBeenCalledWith({ id });
    });

    expect(deferred.watches.size).toBe(0);
    expect(watch.activeNativeWatches()).toBe(0);
  });

  it("starts a new watch after an in-flight stop (FR-023, NFR-006)", async () => {
    const deferred = deferredCapacitorGeolocation();
    const watch = createCapacitorLocationWatch(deferred.api);
    const unsubscribe = watch.subscribe(() => {});
    await vi.waitFor(() => {
      expect(deferred.pendingWatchCount()).toBe(1);
    });
    unsubscribe();
    const staleId = deferred.resolveNextWatch();
    await vi.waitFor(() => {
      expect(deferred.api.clearWatch).toHaveBeenCalledWith({ id: staleId });
    });
    expect(watch.activeNativeWatches()).toBe(0);

    watch.start();
    const late = watch.subscribe(() => {});
    await vi.waitFor(() => {
      expect(deferred.pendingWatchCount()).toBe(1);
    });

    expect(deferred.api.watchPosition).toHaveBeenCalledTimes(2);
    const newId = deferred.resolveNextWatch();
    await vi.waitFor(() => {
      expect(watch.activeNativeWatches()).toBe(1);
    });
    expect(deferred.watches.has(newId)).toBe(true);
    expect(deferred.watches.has(staleId)).toBe(false);
    late();
  });

  it("does not start a plugin watch when Arrêter happens during the permission prompt (FR-027, NFR-006)", async () => {
    const deferred = deferredCapacitorGeolocation({ deferPermissions: true });
    const watch = createCapacitorLocationWatch(deferred.api);
    watch.start();
    const unsubscribe = watch.subscribe(() => {});

    await vi.waitFor(() => {
      expect(deferred.pendingPermissionCount()).toBe(1);
    });
    expect(deferred.api.watchPosition).not.toHaveBeenCalled();
    unsubscribe();

    deferred.grantPermissions("granted");
    await Promise.resolve();
    await Promise.resolve();

    expect(deferred.api.watchPosition).not.toHaveBeenCalled();
    expect(deferred.api.clearWatch).not.toHaveBeenCalled();
    expect(watch.activeNativeWatches()).toBe(0);
    expect(deferred.watches.size).toBe(0);
  });

  it("clears the first in-flight watch when stopNative allows a second start (NFR-006)", async () => {
    const deferred = deferredCapacitorGeolocation();
    const watch = createCapacitorLocationWatch(deferred.api);
    const first = watch.subscribe(() => {});
    await vi.waitFor(() => {
      expect(deferred.pendingWatchCount()).toBe(1);
    });
    first();
    const second = watch.subscribe(() => {});
    await vi.waitFor(() => {
      expect(deferred.pendingWatchCount()).toBe(2);
    });

    const firstId = deferred.resolveNextWatch();
    const secondId = deferred.resolveNextWatch();
    await vi.waitFor(() => {
      expect(deferred.api.clearWatch).toHaveBeenCalledWith({ id: firstId });
      expect(watch.activeNativeWatches()).toBe(1);
    });

    expect(deferred.api.watchPosition).toHaveBeenCalledTimes(2);
    expect(deferred.watches.size).toBe(1);
    expect(deferred.watches.has(secondId)).toBe(true);
    expect(deferred.watches.has(firstId)).toBe(false);
    second();
  });
});
