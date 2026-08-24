import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RideMapViewModel } from "./ride-map-view-model";
import {
  GPS_TRACKING_UNAVAILABLE_MESSAGE,
  RIDE_GEOLOCATE_CONTROL_OPTIONS,
} from "./geolocate-control-options";
import { MAP_UNAVAILABLE_MESSAGE } from "./map-engine";

const {
  addControl,
  removeControl,
  mapRemove,
  mapOn,
  geolocateOn,
  geolocateOnRemove,
  markerRemove,
  easeTo,
  fitBounds,
  mapState,
  routeSource,
  FakeGeolocateControl,
  FakeMap,
  FakeMarker,
} = vi.hoisted(() => {
  const addControl = vi.fn();
  const removeControl = vi.fn();
  const mapRemove = vi.fn();
  const mapOn = vi.fn();
  const geolocateOn = vi.fn();
  const geolocateOnRemove = vi.fn();
  const markerRemove = vi.fn();
  const easeTo = vi.fn();
  const fitBounds = vi.fn();
  const mapState = { painterAvailable: true, markerThrows: false };

  class FakeGeolocateControl {
    options: unknown;
    trigger = vi.fn();

    constructor(options: unknown) {
      this.options = options;
    }

    on = geolocateOn;
    onRemove = geolocateOnRemove;
  }

  const routeSource = { type: "geojson", setData: vi.fn() };

  class FakeMap {
    painter = mapState.painterAvailable ? {} : undefined;
    addControl = addControl;
    removeControl = removeControl;
    remove = mapRemove;
    on = mapOn;
    addSource = vi.fn();
    addLayer = vi.fn();
    getSource = vi.fn(() => routeSource);
    fitBounds = fitBounds;
    easeTo = easeTo;
    isStyleLoaded = () => true;
  }

  class FakeMarker {
    lngLat = { lng: 0, lat: 0 };
    rotation = 0;
    element: HTMLElement | undefined;
    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element;
    }
    setLngLat(value: { lng?: number; lat?: number } | [number, number]) {
      if (Array.isArray(value)) {
        this.lngLat = { lng: value[0], lat: value[1] };
      } else {
        this.lngLat = { lng: value.lng ?? 0, lat: value.lat ?? 0 };
      }
      return this;
    }
    getLngLat() {
      return this.lngLat;
    }
    setRotation(value = 0) {
      this.rotation = value;
      return this;
    }
    setRotationAlignment() {
      return this;
    }
    setPitchAlignment() {
      return this;
    }
    addTo() {
      if (mapState.markerThrows) {
        throw new Error("WebGL transform unavailable");
      }
      return this;
    }
    remove = markerRemove;
  }

  return {
    addControl,
    removeControl,
    mapRemove,
    mapOn,
    geolocateOn,
    geolocateOnRemove,
    markerRemove,
    easeTo,
    fitBounds,
    mapState,
    routeSource,
    FakeGeolocateControl,
    FakeMap,
    FakeMarker,
  };
});

vi.mock("maplibre-gl", () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  GeolocateControl: FakeGeolocateControl,
}));

vi.mock("./maplibre-worker-url", () => ({
  ensureMapLibreWorkerUrl: () => undefined,
}));

const viewModel: RideMapViewModel = {
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
    ],
  },
  bounds: { west: -72.74, south: 45.4, east: -72.7, north: 45.45 },
  start: {
    kind: "start",
    label: "Départ",
    placeLabel: "Granby, QC",
    coordinates: { latitude: 45.4001, longitude: -72.7342 },
  },
  destination: undefined,
  directionLabel: "Sens : boucle depuis Granby, QC",
  directionArrows: [],
};

describe("createMapLibreEngine GPS control (FR-022)", () => {
  beforeEach(() => {
    addControl.mockReset();
    removeControl.mockReset();
    mapRemove.mockReset();
    mapOn.mockReset();
    geolocateOn.mockReset();
    geolocateOnRemove.mockReset();
    markerRemove.mockReset();
    easeTo.mockReset();
    fitBounds.mockReset();
    routeSource.setData.mockReset();
    mapState.painterAvailable = true;
    mapState.markerThrows = false;
  });

  it("adds a voluntary high-accuracy GeolocateControl after mount", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const container = document.createElement("div");
    const engine = createMapLibreEngine();

    engine.mount(container, viewModel, { onError: vi.fn() });

    expect(addControl).toHaveBeenCalledTimes(1);
    const control = addControl.mock.calls[0]?.[0] as InstanceType<
      typeof FakeGeolocateControl
    >;
    expect(control).toBeInstanceOf(FakeGeolocateControl);
    expect(control.options).toEqual(RIDE_GEOLOCATE_CONTROL_OPTIONS);
    expect(geolocateOn).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("does not trigger tracking automatically", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const container = document.createElement("div");

    createMapLibreEngine().mount(container, viewModel, { onError: vi.fn() });

    const control = addControl.mock.calls[0]?.[0] as InstanceType<
      typeof FakeGeolocateControl
    >;
    expect(control.trigger).not.toHaveBeenCalled();
  });

  it("cleans up the GPS control when the map is destroyed", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine().mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );

    handle.destroy();

    expect(removeControl).toHaveBeenCalledTimes(1);
    expect(removeControl.mock.calls[0]?.[0]).toBeInstanceOf(
      FakeGeolocateControl,
    );
    expect(mapRemove).toHaveBeenCalledTimes(1);
  });

  it("recenters on the rider when a GPS marker exists (NFR-006)", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );

    handle.setUserLocation?.({ latitude: 45.41, longitude: -72.72 });
    handle.recenter?.();

    expect(easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lng: -72.72, lat: 45.41 },
      }),
    );
  });

  it("omits GeolocateControl when navigation disables it (FR-023, NFR-006)", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );

    expect(addControl).not.toHaveBeenCalled();
  });

  it("tears down GeolocateControl without remounting and restores it without trigger (FR-022, FR-023, NFR-006)", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine().mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );

    expect(addControl).toHaveBeenCalledTimes(1);
    const first = addControl.mock.calls[0]?.[0] as InstanceType<
      typeof FakeGeolocateControl
    >;
    expect(first.trigger).not.toHaveBeenCalled();

    handle.setGeolocateEnabled?.(false);
    expect(removeControl).toHaveBeenCalledTimes(1);
    expect(removeControl.mock.calls[0]?.[0]).toBe(first);
    expect(mapRemove).not.toHaveBeenCalled();

    handle.setGeolocateEnabled?.(false);
    expect(removeControl).toHaveBeenCalledTimes(1);

    handle.setGeolocateEnabled?.(true);
    expect(addControl).toHaveBeenCalledTimes(2);
    const restored = addControl.mock.calls[1]?.[0] as InstanceType<
      typeof FakeGeolocateControl
    >;
    expect(restored).toBeInstanceOf(FakeGeolocateControl);
    expect(restored).not.toBe(first);
    expect(restored.trigger).not.toHaveBeenCalled();
    expect(mapRemove).not.toHaveBeenCalled();
  });

  it("does not add a GeolocateControl when the engine opted out (FR-023, NFR-006)", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );

    handle.setGeolocateEnabled?.(true);
    expect(addControl).not.toHaveBeenCalled();
  });

  it("reports a GPS error as a warning without treating the map as unavailable", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const onError = vi.fn();
    const onWarning = vi.fn();
    createMapLibreEngine().mount(document.createElement("div"), viewModel, {
      onError,
      onWarning,
    });

    const errorHandler = geolocateOn.mock.calls.find(
      (call) => call[0] === "error",
    )?.[1] as (() => void) | undefined;
    errorHandler?.();

    expect(onWarning).toHaveBeenCalledWith(GPS_TRACKING_UNAVAILABLE_MESSAGE);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not crash when WebGL2 leaves MapLibre partially initialized", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const onError = vi.fn();
    mapState.painterAvailable = false;
    mapRemove.mockImplementationOnce(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'destroy')");
    });

    const handle = createMapLibreEngine().mount(
      document.createElement("div"),
      viewModel,
      { onError },
    );

    expect(onError).toHaveBeenCalledWith(MAP_UNAVAILABLE_MESSAGE);
    expect(addControl).not.toHaveBeenCalled();
    expect(() => handle.destroy()).not.toThrow();
    expect(mapRemove).toHaveBeenCalledTimes(1);
  });

  it("updates the route source in place without removing the map (FR-026)", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );
    const load = mapOn.mock.calls.find((call) => call[0] === "load")?.[1] as
      | (() => void)
      | undefined;
    load?.();

    handle.setViewModel?.({
      ...viewModel,
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.7342, 45.4001],
          [-72.65, 45.5],
        ],
      },
    });

    expect(routeSource.setData).toHaveBeenCalled();
    expect(mapRemove).not.toHaveBeenCalled();
    expect(fitBounds).toHaveBeenCalled();
    handle.destroy();
  });

  it("does not throw if the camera ease fails while drawing the route (NFR-006)", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const onError = vi.fn();
    const onWarning = vi.fn();
    const handle = createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError, onWarning },
    );
    const load = mapOn.mock.calls.find((call) => call[0] === "load")?.[1] as
      | (() => void)
      | undefined;
    expect(() => load?.()).not.toThrow();
    expect(fitBounds).not.toHaveBeenCalled();

    fitBounds.mockImplementationOnce(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'lng')");
    });
    expect(() =>
      handle.setViewModel?.({
        ...viewModel,
        geometry: {
          type: "LineString",
          coordinates: [
            [-72.7342, 45.4001],
            [-72.65, 45.5],
          ],
        },
      }),
    ).not.toThrow();
    expect(onError).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledWith(MAP_UNAVAILABLE_MESSAGE);
    handle.destroy();
  });

  it("does not throw when the GPS marker cannot be attached (NFR-006)", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const onError = vi.fn();
    const onWarning = vi.fn();
    mapState.markerThrows = true;
    const handle = createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError, onWarning },
    );

    expect(() =>
      handle.setUserLocation?.({ latitude: 45.41, longitude: -72.72 }),
    ).not.toThrow();
    expect(onError).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledWith(MAP_UNAVAILABLE_MESSAGE);
  });
});

describe("createMapLibreEngine navigation follow (FR-024, FR-028)", () => {
  beforeEach(() => {
    addControl.mockReset();
    removeControl.mockReset();
    mapRemove.mockReset();
    mapOn.mockReset();
    geolocateOn.mockReset();
    geolocateOnRemove.mockReset();
    markerRemove.mockReset();
    easeTo.mockReset();
    fitBounds.mockReset();
    routeSource.setData.mockReset();
    mapState.painterAvailable = true;
    mapState.markerThrows = false;
  });

  it("follows the rider heading-up after GeolocateControl is torn down", async () => {
    const { createMapLibreEngine, NAVIGATION_FOLLOW_PADDING } = await import(
      "./maplibre-map-engine"
    );
    const handle = createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );

    handle.setFollowUser?.(true);
    handle.setUserLocation?.({ latitude: 45.41, longitude: -72.72 }, 90);

    expect(easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lng: -72.72, lat: 45.41 },
        zoom: 16,
        pitch: 45,
        bearing: 90,
        padding: NAVIGATION_FOLLOW_PADDING,
      }),
    );
  });

  it("stops following after a user pan and resumes on Recentrer", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );

    handle.setFollowUser?.(true);
    handle.setUserLocation?.({ latitude: 45.41, longitude: -72.72 }, 90);
    easeTo.mockClear();

    const dragstart = mapOn.mock.calls.find((call) => call[0] === "dragstart")?.[1] as
      | ((event: { originalEvent?: Event }) => void)
      | undefined;
    dragstart?.({ originalEvent: new Event("mousedown") });

    handle.setUserLocation?.({ latitude: 45.42, longitude: -72.71 }, 95);
    expect(easeTo).not.toHaveBeenCalled();

    handle.recenter?.();
    expect(easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lng: -72.71, lat: 45.42 },
        bearing: 95,
      }),
    );
  });

  it("does not refit the whole route while following a recalculated line (FR-013, FR-026)", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine({ geolocate: false }).mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );
    const load = mapOn.mock.calls.find((call) => call[0] === "load")?.[1] as
      | (() => void)
      | undefined;
    load?.();

    handle.setFollowUser?.(true);
    handle.setUserLocation?.({ latitude: 45.41, longitude: -72.72 }, 90);
    fitBounds.mockClear();

    handle.setViewModel?.({
      ...viewModel,
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.7342, 45.4001],
          [-72.65, 45.5],
        ],
      },
    });

    expect(routeSource.setData).toHaveBeenCalled();
    expect(fitBounds).not.toHaveBeenCalled();
    handle.destroy();
  });
});
