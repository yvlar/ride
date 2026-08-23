import { appendFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeolocateControl } from "maplibre-gl";
import { RIDE_GEOLOCATE_CONTROL_OPTIONS } from "@/components/map/geolocate-control-options";
import { createBrowserLocationWatch } from "./browser-location-watch";
import {
  getGeolocationWatchSnapshot,
  installGeolocationWatchProbe,
  resetGeolocationWatchProbe,
  writeGeolocationWatchLog,
} from "./geolocation-watch-probe";

function stubBrowserGeolocation() {
  let nextId = 1;
  const geo = {
    watchPosition: vi.fn<typeof navigator.geolocation.watchPosition>(
      (_success, _error, _options) => {
        const id = nextId;
        nextId += 1;
        return id;
      },
    ),
    clearWatch: vi.fn<typeof navigator.geolocation.clearWatch>(() => {}),
    getCurrentPosition: vi.fn(),
  };
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: geo,
    permissions: undefined,
  });
  return geo;
}

function fakeMap() {
  return {
    _getUIString: (key: string) => key,
    on: vi.fn(),
    off: vi.fn(),
    getMaxBounds: () => null,
    isZooming: () => false,
  };
}

afterEach(() => {
  resetGeolocationWatchProbe();
  vi.unstubAllGlobals();
});

describe("geolocation watch probe (FR-022, FR-023, NFR-006)", () => {
  it("counts native watchPosition and clearWatch on navigator", () => {
    const geo = stubBrowserGeolocation();
    const originalWatch = geo.watchPosition;
    const originalClear = geo.clearWatch;
    installGeolocationWatchProbe();
    resetGeolocationWatchProbe();

    const first = navigator.geolocation.watchPosition(() => {});
    const second = navigator.geolocation.watchPosition(() => {});
    expect(getGeolocationWatchSnapshot()).toMatchObject({
      watchPositionCalls: 2,
      outstandingCount: 2,
    });
    navigator.geolocation.clearWatch(first);
    expect(getGeolocationWatchSnapshot().outstandingCount).toBe(1);
    navigator.geolocation.clearWatch(second);
    expect(originalWatch).toHaveBeenCalledTimes(2);
    expect(originalClear).toHaveBeenCalledTimes(2);
  });

  it("records separate native watches for preview GeolocateControl and navigation LocationWatch", async () => {
    stubBrowserGeolocation();
    installGeolocationWatchProbe();
    resetGeolocationWatchProbe();

    const control = new GeolocateControl({
      ...RIDE_GEOLOCATE_CONTROL_OPTIONS,
      showUserLocation: false,
      showAccuracyCircle: false,
    });
    control.onAdd(fakeMap() as never);
    await vi.waitFor(() => {
      expect(
        (control as unknown as { _setup?: boolean })._setup,
      ).toBe(true);
    });
    expect(control.trigger()).toBe(true);

    const afterPreview = getGeolocationWatchSnapshot();
    // #region agent log
    writeGeolocationWatchLog({
      hypothesisId: "A",
      location: "geolocation-watch-probe.test.ts:afterPreview",
      message: "after GeolocateControl.trigger",
      data: afterPreview,
    });
    // #endregion

    const locationWatch = createBrowserLocationWatch();
    locationWatch.start();
    const afterNavigation = getGeolocationWatchSnapshot();
    // #region agent log
    writeGeolocationWatchLog({
      hypothesisId: "B",
      location: "geolocation-watch-probe.test.ts:afterNavigation",
      message: "after LocationWatch.start while preview still tracking",
      data: {
        ...afterNavigation,
        locationWatchNative: locationWatch.activeNativeWatches(),
      },
    });
    // #endregion

    expect(afterPreview.watchPositionCalls).toBeGreaterThanOrEqual(1);
    expect(afterPreview.outstandingCount).toBe(1);
    expect(afterNavigation.watchPositionCalls).toBeGreaterThanOrEqual(2);
    expect(afterNavigation.outstandingCount).toBeGreaterThanOrEqual(2);
    expect(afterNavigation.sources).toEqual(
      expect.arrayContaining(["maplibre-geolocate", "location-watch"]),
    );
    expect(locationWatch.activeNativeWatches()).toBe(1);

    appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({
        id: `log_${Date.now()}_hazard`,
        timestamp: Date.now(),
        hypothesisId: "B",
        location: "geolocation-watch-probe.test.ts:hazard",
        message: "dual-watch still happens without teardown",
        data: {
          afterPreview,
          afterNavigation,
          locationWatchNative: locationWatch.activeNativeWatches(),
          secondWatchOpened: afterNavigation.outstandingCount >= 2,
        },
      })}\n`,
    );
  });

  it("leaves one native watch when GeolocateControl is torn down before LocationWatch.start (FR-022, FR-023, NFR-006)", async () => {
    stubBrowserGeolocation();
    installGeolocationWatchProbe();
    resetGeolocationWatchProbe();

    const control = new GeolocateControl({
      ...RIDE_GEOLOCATE_CONTROL_OPTIONS,
      showUserLocation: false,
      showAccuracyCircle: false,
    });
    const map = fakeMap();
    control.onAdd(map as never);
    await vi.waitFor(() => {
      expect(
        (control as unknown as { _setup?: boolean })._setup,
      ).toBe(true);
    });
    expect(control.trigger()).toBe(true);
    expect(getGeolocationWatchSnapshot().outstandingCount).toBe(1);

    control.onRemove();
    const afterTeardown = getGeolocationWatchSnapshot();
    // #region agent log
    writeGeolocationWatchLog({
      hypothesisId: "C",
      location: "geolocation-watch-probe.test.ts:afterTeardown",
      message: "after GeolocateControl.onRemove",
      data: afterTeardown,
    });
    // #endregion

    const locationWatch = createBrowserLocationWatch();
    locationWatch.start();
    const afterNavigation = getGeolocationWatchSnapshot();
    // #region agent log
    writeGeolocationWatchLog({
      hypothesisId: "B",
      location: "geolocation-watch-probe.test.ts:afterTeardownThenStart",
      message: "after LocationWatch.start with preview geolocate removed",
      data: {
        ...afterNavigation,
        locationWatchNative: locationWatch.activeNativeWatches(),
      },
    });
    // #endregion

    expect(afterTeardown.outstandingCount).toBe(0);
    expect(afterTeardown.clearWatchCalls).toBeGreaterThanOrEqual(1);
    expect(afterNavigation.outstandingCount).toBe(1);
    expect(afterNavigation.sources).toEqual(["location-watch"]);
    expect(locationWatch.activeNativeWatches()).toBe(1);

    appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({
        id: `log_${Date.now()}_fix`,
        timestamp: Date.now(),
        hypothesisId: "C",
        location: "geolocation-watch-probe.test.ts:fix",
        message: "single-watch after teardown",
        data: {
          afterTeardown,
          afterNavigation,
          locationWatchNative: locationWatch.activeNativeWatches(),
          singleWatch: afterNavigation.outstandingCount === 1,
        },
      })}\n`,
    );
  });
});
