import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapMountOptions } from "./map-engine";
import { BASE_FRAME_PADDING, type RideMapViewModel } from "./ride-map-view-model";

const { mapState, fitBounds, FakeMap, FakeMarker } = vi.hoisted(() => {
  const fitBounds = vi.fn();
  const mapState = {
    styleLoaded: false,
    sources: new Map<string, { setData: ReturnType<typeof vi.fn> }>(),
    loadHandlers: [] as Array<() => void>,
    handlers: new Map<string, Array<(event?: unknown) => void>>(),
    reset() {
      this.styleLoaded = false;
      this.sources.clear();
      this.loadHandlers.length = 0;
      this.handlers.clear();
    },
  };

  class FakeMap {
    painter = {};
    addControl = vi.fn();
    removeControl = vi.fn();
    remove = vi.fn();
    addLayer = vi.fn();
    fitBounds = fitBounds;
    easeTo = vi.fn();
    setPaintProperty = vi.fn();
    isStyleLoaded = () => mapState.styleLoaded;
    on(event: string, handler: (payload?: unknown) => void) {
      if (event === "load") {
        mapState.loadHandlers.push(handler);
      }
      const registered = mapState.handlers.get(event) ?? [];
      registered.push(handler);
      mapState.handlers.set(event, registered);
    }
    addSource(id: string) {
      mapState.sources.set(id, { setData: vi.fn() });
    }
    getSource(id: string) {
      return mapState.sources.get(id);
    }
    getStyle() {
      return { version: 8, sources: {}, layers: [] };
    }
    getLayer() {
      return undefined;
    }
  }

  class FakeMarker {
    setLngLat() {
      return this;
    }
    setRotation() {
      return this;
    }
    setRotationAlignment() {
      return this;
    }
    setPitchAlignment() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }

  return { mapState, fitBounds, FakeMap, FakeMarker };
});

vi.mock("maplibre-gl", () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  GeolocateControl: class {
    on() {}
    onRemove() {}
  },
}));

vi.mock("./maplibre-worker-url", () => ({
  ensureMapLibreWorkerUrl: () => undefined,
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

function model(west: number, east: number): RideMapViewModel {
  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [west, 45],
        [east, 46],
      ],
    },
    bounds: { west, south: 45, east, north: 46 },
    start: {
      kind: "start",
      label: "Départ",
      placeLabel: "Départ",
      coordinates: { latitude: 45, longitude: west },
    },
    directionLabel: "",
    directionArrows: [],
  };
}

const QUEBEC = model(-72.8, -72.6);
const ELSEWHERE = model(-122.4, -122.2);

async function mountEngine(
  initial: RideMapViewModel,
  options?: MapMountOptions,
) {
  const { createMapLibreEngine } = await import("./maplibre-map-engine");
  return createMapLibreEngine().mount(
    document.createElement("div"),
    initial,
    {
      onError: vi.fn(),
      onWarning: vi.fn(),
    },
    options,
  );
}

/** The rider's own gesture on the camera: only these carry an original event. */
function dragMap() {
  for (const handler of mapState.handlers.get("dragstart") ?? []) {
    handler({ originalEvent: new Event("pointerdown") });
  }
}

function bottomPadding(call: number): number {
  const options = fitBounds.mock.calls[call]?.[1] as {
    padding: { bottom: number };
  };
  return options.padding.bottom;
}

function fireLoad() {
  for (const handler of mapState.loadHandlers) {
    handler();
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

beforeEach(() => {
  mapState.reset();
  fitBounds.mockClear();
});

describe("MapLibre route framing (FR-013, FR-042)", () => {
  it("frames a route that arrived before the style was ready", async () => {
    const handle = await mountEngine(QUEBEC);

    // A session restored on load, or simply a route that beat the tiles.
    handle.setViewModel?.(ELSEWHERE);
    mapState.styleLoaded = true;
    fireLoad();
    await nextFrame();

    expect(fitBounds).toHaveBeenCalledTimes(1);
    // mapCameraFrame turns the bounds into a [[west, south], [east, north]] box.
    expect(fitBounds.mock.calls[0]![0]).toEqual([
      [-122.4, 45],
      [-122.2, 46],
    ]);
  });

  it("does not re-frame when the style was ready all along", async () => {
    mapState.styleLoaded = true;
    const handle = await mountEngine(QUEBEC);
    fireLoad();
    fitBounds.mockClear();

    handle.setViewModel?.(ELSEWHERE);
    await nextFrame();

    // The synchronous fit already happened inside setViewModel; the deferred
    // one must not fire a second time.
    expect(fitBounds).toHaveBeenCalledTimes(1);
  });

  it("leaves the camera alone once the rider is being followed", async () => {
    const handle = await mountEngine(QUEBEC);
    handle.setViewModel?.(ELSEWHERE);
    handle.setUserLocation?.({ latitude: 47.6, longitude: -122.3 }, null);
    handle.setFollowUser?.(true);
    fitBounds.mockClear();

    mapState.styleLoaded = true;
    fireLoad();
    await nextFrame();

    expect(fitBounds).not.toHaveBeenCalled();
  });

  it("frames a trajet above the panel covering the map (FR-038)", async () => {
    mapState.styleLoaded = true;
    const handle = await mountEngine(QUEBEC, { frameInsets: { bottom: 260 } });
    fireLoad();
    fitBounds.mockClear();

    handle.setViewModel?.(ELSEWHERE);

    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(bottomPadding(0)).toBe(BASE_FRAME_PADDING + 260);
  });

  it("re-frames the trajet when the panel grows or folds (FR-038)", async () => {
    mapState.styleLoaded = true;
    const handle = await mountEngine(QUEBEC);
    fireLoad();
    handle.setViewModel?.(ELSEWHERE);
    fitBounds.mockClear();

    handle.setFrameInsets?.({ bottom: 300 });

    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds.mock.calls[0]![0]).toEqual([
      [-122.4, 45],
      [-122.2, 46],
    ]);
    expect(bottomPadding(0)).toBe(BASE_FRAME_PADDING + 300);

    // An unchanged inset is not a reason to move the camera.
    fitBounds.mockClear();
    handle.setFrameInsets?.({ bottom: 300 });
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it("leaves a camera the rider moved where they put it (FR-038)", async () => {
    mapState.styleLoaded = true;
    const handle = await mountEngine(QUEBEC);
    fireLoad();
    handle.setViewModel?.(ELSEWHERE);
    dragMap();
    fitBounds.mockClear();

    handle.setFrameInsets?.({ bottom: 300 });

    expect(fitBounds).not.toHaveBeenCalled();

    // The next trajet frames again, panel included: the rider asked for it.
    handle.setViewModel?.(QUEBEC);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(bottomPadding(0)).toBe(BASE_FRAME_PADDING + 300);
  });

  it("keeps the initial frame when no route ever replaces it", async () => {
    await mountEngine(QUEBEC);

    mapState.styleLoaded = true;
    fireLoad();
    await nextFrame();

    // The constructor already framed this one: a second fit would fight it.
    expect(fitBounds).not.toHaveBeenCalled();
  });
});
