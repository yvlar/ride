import { beforeEach, describe, expect, it, vi } from "vitest";
import { KART_ARCADE_MAP_OVERLAY_THEME } from "./map-theme-overlay";
import type { MapOverlayTheme } from "./map-theme-overlay";
import type { RideMapViewModel } from "./ride-map-view-model";
import type { WeatherMapOverlay } from "./weather-overlay";

const {
  mapState,
  addLayer,
  removeLayer,
  removeSource,
  setPaintProperty,
  createdMarkers,
  FakeMap,
  FakeMarker,
} = vi.hoisted(() => {
  const addLayer = vi.fn();
  const removeLayer = vi.fn();
  const removeSource = vi.fn();
  const setPaintProperty = vi.fn();
  const createdMarkers: { element?: HTMLElement; removed: boolean }[] = [];
  const mapState = {
    sources: new Map<string, Record<string, unknown>>(),
    layers: new Set<string>(),
    loadHandlers: [] as Array<() => void>,
    styleLoadHandlers: [] as Array<() => void>,
    styleLayers: [] as Array<{ id: string; type: string }>,
    /** MapLibre 5 raster sources can be retargeted; older ones cannot. */
    rasterSetTiles: true,
    reset() {
      this.sources.clear();
      this.layers.clear();
      this.loadHandlers.length = 0;
      this.styleLoadHandlers.length = 0;
      this.styleLayers = [];
      this.rasterSetTiles = true;
    },
  };

  class FakeMap {
    painter = {};
    addControl = vi.fn();
    removeControl = vi.fn();
    remove = vi.fn();
    fitBounds = vi.fn();
    easeTo = vi.fn();
    isStyleLoaded = () => true;
    on(event: string, handler: () => void) {
      if (event === "load") {
        mapState.loadHandlers.push(handler);
      }
    }
    once(event: string, handler: () => void) {
      if (event === "style.load") {
        mapState.styleLoadHandlers.push(handler);
      }
    }
    off() {}
    setStyle() {
      // MapLibre drops every source and layer when the style is replaced.
      mapState.sources.clear();
      mapState.layers.clear();
    }
    addSource(id: string, source: Record<string, unknown>) {
      mapState.sources.set(id, {
        ...source,
        ...(source.type === "raster" && mapState.rasterSetTiles
          ? { setTiles: vi.fn((tiles: string[]) => {
              mapState.sources.set(id, {
                ...(mapState.sources.get(id) ?? {}),
                tiles,
              });
            }) }
          : { setData: vi.fn() }),
      });
    }
    getSource(id: string) {
      return mapState.sources.get(id);
    }
    removeSource(id: string) {
      removeSource(id);
      mapState.sources.delete(id);
    }
    addLayer(layer: { id: string }, beforeId?: string) {
      addLayer(layer, beforeId);
      mapState.layers.add(layer.id);
    }
    removeLayer(id: string) {
      removeLayer(id);
      mapState.layers.delete(id);
    }
    getLayer(id: string) {
      return mapState.layers.has(id) ? { id } : undefined;
    }
    setPaintProperty = setPaintProperty;
    getStyle() {
      return { version: 8, sources: {}, layers: mapState.styleLayers };
    }
  }

  class FakeMarker {
    element: HTMLElement | undefined;
    removed = false;
    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element;
      createdMarkers.push(this);
    }
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
    remove() {
      this.removed = true;
    }
  }

  return {
    mapState,
    addLayer,
    removeLayer,
    removeSource,
    setPaintProperty,
    createdMarkers,
    FakeMap,
    FakeMarker,
  };
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

const viewModel: RideMapViewModel = {
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.75, 45.5],
      [-72.7, 45.55],
    ],
  },
  bounds: { west: -72.8, south: 45.45, east: -72.65, north: 45.6 },
  start: {
    kind: "start",
    label: "Départ",
    placeLabel: "Granby",
    coordinates: { latitude: 45.5, longitude: -72.75 },
  },
  directionLabel: "Sens : boucle depuis Granby",
  directionArrows: [],
};

const overlay: WeatherMapOverlay = {
  radarTileUrlTemplate: "https://tiles.test/latest/{z}/{x}/{y}.png",
  radarOpacity: 0.6,
  radarMaxZoom: 7,
  attribution: "Images radar © Test",
  clouds: [
    {
      id: "cloud-1",
      coordinates: { latitude: 45.2, longitude: -73.1 },
      level: "rain",
      probability: 72,
      label: "Pluie, 72 % de risque de pluie",
    },
    {
      id: "cloud-2",
      coordinates: { latitude: 45.8, longitude: -72.4 },
      level: "cloudy",
      probability: 10,
      label: "Nuageux, 10 % de risque de pluie",
    },
  ],
};

async function mountEngine(mapOverlay?: MapOverlayTheme) {
  const { createMapLibreEngine } = await import("./maplibre-map-engine");
  const handle = createMapLibreEngine().mount(
    document.createElement("div"),
    viewModel,
    { onError: vi.fn(), onWarning: vi.fn() },
    mapOverlay ? { mapOverlay } : undefined,
  );
  for (const handler of mapState.loadHandlers) {
    handler();
  }
  return handle;
}

beforeEach(() => {
  mapState.reset();
  createdMarkers.length = 0;
  addLayer.mockClear();
  removeLayer.mockClear();
  removeSource.mockClear();
  setPaintProperty.mockClear();
});

describe("MapLibre weather layer (FR-043)", () => {
  it("draws no radar until the rider turns the layer on", async () => {
    await mountEngine();

    expect(mapState.sources.has("ride-radar")).toBe(false);
    expect(cloudElements()).toHaveLength(0);
  });

  it("adds the radar tiles under the route line", async () => {
    const handle = await mountEngine();

    handle.setWeather?.(overlay);

    expect(mapState.sources.get("ride-radar")).toMatchObject({
      type: "raster",
      tiles: ["https://tiles.test/latest/{z}/{x}/{y}.png"],
      tileSize: 256,
      // Past the provider's deepest zoom the map upscales instead of asking
      // for tiles that come back as a "not supported" placeholder.
      maxzoom: 7,
      attribution: "Images radar © Test",
    });
    const radarLayer = addLayer.mock.calls.find(
      ([layer]) => layer.id === "ride-radar-tiles",
    );
    expect(radarLayer?.[0].paint).toEqual({ "raster-opacity": 0.6 });
    expect(radarLayer?.[1]).toBe("ride-traveled-line");
  });

  it("slips the radar under the labels when the style has some", async () => {
    mapState.styleLayers = [
      { id: "background", type: "background" },
      { id: "roads", type: "line" },
      { id: "place-labels", type: "symbol" },
    ];
    const handle = await mountEngine();

    handle.setWeather?.(overlay);

    const radarLayer = addLayer.mock.calls.find(
      ([layer]) => layer.id === "ride-radar-tiles",
    );
    // Under the labels keeps street names readable through a cell.
    expect(radarLayer?.[1]).toBe("place-labels");
  });

  it("puts one accessible cloud marker on each wet sample", async () => {
    const handle = await mountEngine();

    handle.setWeather?.(overlay);

    const labels = cloudElements().map((element) =>
      element.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Pluie, 72 % de risque de pluie",
      "Nuageux, 10 % de risque de pluie",
    ]);
  });

  it("retargets the same source when the rider steps to another frame", async () => {
    const handle = await mountEngine();
    handle.setWeather?.(overlay);

    handle.setWeather?.({
      ...overlay,
      radarTileUrlTemplate: "https://tiles.test/next/{z}/{x}/{y}.png",
    });

    expect(mapState.sources.get("ride-radar")).toMatchObject({
      tiles: ["https://tiles.test/next/{z}/{x}/{y}.png"],
    });
    expect(removeSource).not.toHaveBeenCalled();
  });

  it("rebuilds the source when it cannot be retargeted", async () => {
    mapState.rasterSetTiles = false;
    const handle = await mountEngine();
    handle.setWeather?.(overlay);

    handle.setWeather?.({
      ...overlay,
      radarTileUrlTemplate: "https://tiles.test/next/{z}/{x}/{y}.png",
    });

    expect(removeLayer).toHaveBeenCalledWith("ride-radar-tiles");
    expect(removeSource).toHaveBeenCalledWith("ride-radar");
    expect(mapState.sources.get("ride-radar")).toMatchObject({
      tiles: ["https://tiles.test/next/{z}/{x}/{y}.png"],
    });
  });

  it("clears radar and clouds when the layer goes off", async () => {
    const handle = await mountEngine();
    handle.setWeather?.(overlay);
    const drawn = cloudMarkers();

    handle.setWeather?.(null);

    expect(mapState.sources.has("ride-radar")).toBe(false);
    expect(mapState.layers.has("ride-radar-tiles")).toBe(false);
    expect(drawn.every((marker) => marker.removed)).toBe(true);
    expect(cloudElements()).toHaveLength(0);
  });

  it("lets the map request every zoom when the provider caps none", async () => {
    const handle = await mountEngine();

    handle.setWeather?.({ ...overlay, radarMaxZoom: null });

    expect(mapState.sources.get("ride-radar")).not.toHaveProperty("maxzoom");
  });

  it("keeps the clouds when the provider has no imagery", async () => {
    const handle = await mountEngine();

    handle.setWeather?.({ ...overlay, radarTileUrlTemplate: null });

    expect(mapState.sources.has("ride-radar")).toBe(false);
    expect(cloudElements()).toHaveLength(2);
  });

  it("replaces the previous clouds on each refresh", async () => {
    const handle = await mountEngine();
    handle.setWeather?.(overlay);
    const first = cloudMarkers();

    handle.setWeather?.({ ...overlay, clouds: [overlay.clouds[0]!] });

    expect(first.every((marker) => marker.removed)).toBe(true);
    expect(cloudElements()).toHaveLength(1);
  });

  it("takes the clouds down with the map", async () => {
    const handle = await mountEngine();
    handle.setWeather?.(overlay);
    const drawn = cloudMarkers();

    handle.destroy();

    expect(drawn.every((marker) => marker.removed)).toBe(true);
  });

  it("ignores a weather update once the map is gone", async () => {
    const handle = await mountEngine();
    handle.destroy();

    handle.setWeather?.(overlay);

    expect(cloudElements()).toHaveLength(0);
  });

  it("puts the radar back after a basemap change (FR-045, FR-043)", async () => {
    const handle = await mountEngine();
    handle.setWeather?.(overlay);
    expect(mapState.sources.has("ride-radar")).toBe(true);
    addLayer.mockClear();

    handle.setMapStyle?.("https://tiles.test/dark/style.json");
    // setStyle wiped everything the engine had drawn on the old basemap.
    expect(mapState.sources.has("ride-radar")).toBe(false);
    for (const handler of mapState.styleLoadHandlers) {
      handler();
    }

    expect(mapState.sources.get("ride-radar")).toMatchObject({
      type: "raster",
      tiles: ["https://tiles.test/latest/{z}/{x}/{y}.png"],
    });
    expect(
      addLayer.mock.calls.map(([layer]) => layer.id),
    ).toEqual(expect.arrayContaining(["ride-route-line", "ride-radar-tiles"]));
  });
});

describe("Kart Arcade clouds (FR-046)", () => {
  it("gives the clouds a face under the arcade theme, and only there", async () => {
    const arcade = await mountEngine(KART_ARCADE_MAP_OVERLAY_THEME);
    arcade.setWeather?.(overlay);

    const faces = cloudElements();
    expect(faces).toHaveLength(2);
    for (const element of faces) {
      expect(element.classList.contains("ride-map-cloud--arcade")).toBe(true);
      expect(element.querySelectorAll(".ride-map-cloud-eye")).toHaveLength(2);
      // The badge and the accessible name are the same on every theme.
      expect(element.getAttribute("aria-label")).toMatch(/risque de pluie$/);
      expect(element.textContent).toMatch(/%$/);
    }
  });

  it("leaves the plain glyph on every other theme", async () => {
    const standard = await mountEngine();
    standard.setWeather?.(overlay);

    for (const element of cloudElements()) {
      expect(element.classList.contains("ride-map-cloud--arcade")).toBe(false);
      expect(element.querySelector(".ride-map-cloud-face")).toBeNull();
    }
  });
});

function cloudMarkers() {
  return createdMarkers.filter((marker) =>
    marker.element?.classList.contains("ride-map-cloud"),
  );
}

function cloudElements(): HTMLElement[] {
  return cloudMarkers()
    .filter((marker) => !marker.removed)
    .map((marker) => marker.element!)
    .filter(Boolean);
}
