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
});
