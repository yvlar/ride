import { describe, expect, it, vi } from "vitest";
import { FOREGROUND_LOCATION_WATCH_OPTIONS } from "@/domain/location/types";
import { createBrowserLocationWatch } from "./browser-location-watch";

function fakeGeolocation() {
  let nextId = 1;
  const watches = new Map<number, PositionCallback>();
  const api = {
    watchPosition: vi.fn<typeof navigator.geolocation.watchPosition>(
      (success) => {
        const id = nextId;
        nextId += 1;
        watches.set(id, success);
        return id;
      },
    ),
    clearWatch: vi.fn<typeof navigator.geolocation.clearWatch>((id) => {
      watches.delete(id);
    }),
  };
  return { api, watches };
}

describe("createBrowserLocationWatch (FR-023, NFR-006)", () => {
  it("starts a single watchPosition subscription for several listeners", () => {
    const { api } = fakeGeolocation();
    const watch = createBrowserLocationWatch(api);
    const first = watch.subscribe(() => {});
    const second = watch.subscribe(() => {});

    expect(api.watchPosition).toHaveBeenCalledTimes(1);
    expect(api.watchPosition.mock.calls[0]?.[2]).toMatchObject(
      FOREGROUND_LOCATION_WATCH_OPTIONS,
    );
    expect(watch.activeNativeWatches()).toBe(1);

    first();
    expect(api.clearWatch).not.toHaveBeenCalled();
    second();
    expect(api.clearWatch).toHaveBeenCalledTimes(1);
    expect(watch.activeNativeWatches()).toBe(0);
  });

  it("clears the native watch on the last unsubscribe", () => {
    const { api } = fakeGeolocation();
    const watch = createBrowserLocationWatch(api);
    const stop = watch.subscribe(() => {});
    stop();
    expect(api.clearWatch).toHaveBeenCalledTimes(1);
  });

  it("does not start a watch until someone subscribes", () => {
    const { api } = fakeGeolocation();
    createBrowserLocationWatch(api);
    expect(api.watchPosition).not.toHaveBeenCalled();
  });

  it("starts watchPosition from start() before any subscriber (FR-023)", () => {
    const { api } = fakeGeolocation();
    const watch = createBrowserLocationWatch(api);
    watch.start();
    expect(api.watchPosition).toHaveBeenCalledTimes(1);
    watch.subscribe(() => {});
    expect(api.watchPosition).toHaveBeenCalledTimes(1);
    expect(watch.activeNativeWatches()).toBe(1);
  });

  it("replays the last GPS event to a late subscriber (FR-023)", () => {
    const { api, watches } = fakeGeolocation();
    const watch = createBrowserLocationWatch(api);
    watch.start();
    const [firstWatch] = watches.values();
    firstWatch?.({
      coords: {
        latitude: 45.4,
        longitude: -72.7,
        accuracy: 8,
        heading: null,
        speed: null,
        altitude: null,
        altitudeAccuracy: null,
      },
      timestamp: 1,
    } as GeolocationPosition);

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

  it("does not throw when watchPosition rejects the call (FR-023)", () => {
    const api = {
      watchPosition: () => {
        throw new Error("SecurityError");
      },
      clearWatch: vi.fn(),
    };
    const watch = createBrowserLocationWatch(api);
    const listener = vi.fn();
    expect(() => watch.start()).not.toThrow();
    watch.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ code: "UNAVAILABLE" }),
      }),
    );
  });

  it("delivers a subscribe-time GPS error once (FR-023)", () => {
    const api = {
      watchPosition: () => {
        throw new Error("SecurityError");
      },
      clearWatch: vi.fn(),
    };
    const listener = vi.fn();
    createBrowserLocationWatch(api).subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not replay a start() error that subscribe would emit again (FR-023)", () => {
    const api = {
      watchPosition: vi.fn(() => {
        throw new Error("SecurityError");
      }),
      clearWatch: vi.fn(),
    };
    const watch = createBrowserLocationWatch(api);
    watch.start();
    expect(api.watchPosition).toHaveBeenCalledTimes(1);

    const first = vi.fn();
    const second = vi.fn();
    watch.subscribe(first);
    watch.subscribe(second);

    expect(api.watchPosition).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
