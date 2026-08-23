import { describe, expect, it, vi } from "vitest";
import type { MapEngine, MapEngineHandle } from "./map-engine";
import {
  createNavigationMapEngine,
  prefersLightweightNavigationMap,
} from "./navigation-map-engine";
import { createRideMapEngine } from "./ride-map-engine";
import type { RideMapViewModel } from "./ride-map-view-model";

const viewModel: RideMapViewModel = {
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7, 45.4],
      [-72.68, 45.41],
    ],
  },
  bounds: { west: -72.7, south: 45.4, east: -72.68, north: 45.41 },
  start: {
    kind: "start",
    label: "Départ",
    placeLabel: "Granby",
    coordinates: { latitude: 45.4, longitude: -72.7 },
  },
  directionLabel: "Sens : boucle depuis Granby",
  directionArrows: [],
};

function stubEngine() {
  const handle: MapEngineHandle = {
    destroy: vi.fn(),
    setUserLocation: vi.fn(),
    recenter: vi.fn(),
    setViewModel: vi.fn(),
  };
  const mount = vi.fn(() => handle);
  return { engine: { mount } satisfies MapEngine, mount, handle };
}

const iPhone = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const linuxDesktop = {
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140 Safari/537.36",
  platform: "Linux x86_64",
  maxTouchPoints: 0,
};

describe("createNavigationMapEngine (FR-023, NFR-006)", () => {
  it("does not allocate MapLibre for an iPhone navigation session", () => {
    const mapLibre = stubEngine();
    const lightweight = stubEngine();
    const engine = createNavigationMapEngine({
      mapLibre: mapLibre.engine,
      lightweight: lightweight.engine,
      platform: iPhone,
    });

    const handle = engine.mount(document.createElement("div"), viewModel, {
      onError: vi.fn(),
    });
    handle.setUserLocation({ latitude: 45.4, longitude: -72.7 });
    handle.setViewModel(viewModel);
    handle.recenter();
    handle.destroy();

    expect(mapLibre.mount).not.toHaveBeenCalled();
    expect(lightweight.mount).toHaveBeenCalledTimes(1);
    expect(lightweight.handle.setUserLocation).toHaveBeenCalledTimes(1);
    expect(lightweight.handle.setViewModel).toHaveBeenCalledTimes(1);
    expect(lightweight.handle.recenter).toHaveBeenCalledTimes(1);
    expect(lightweight.handle.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps MapLibre on non-iOS browsers", () => {
    const mapLibre = stubEngine();
    const lightweight = stubEngine();
    const engine = createNavigationMapEngine({
      mapLibre: mapLibre.engine,
      lightweight: lightweight.engine,
      platform: linuxDesktop,
    });

    engine.mount(document.createElement("div"), viewModel, {
      onError: vi.fn(),
    });

    expect(mapLibre.mount).toHaveBeenCalledTimes(1);
    expect(lightweight.mount).not.toHaveBeenCalled();
  });
});

describe("createRideMapEngine (FR-013, FR-023)", () => {
  it("does not allocate MapLibre for an iPhone preview map", () => {
    const mapLibre = stubEngine();
    const lightweight = stubEngine();
    const engine = createRideMapEngine({
      mapLibre: mapLibre.engine,
      lightweight: lightweight.engine,
      platform: iPhone,
    });

    engine.mount(document.createElement("div"), viewModel, {
      onError: vi.fn(),
    });

    expect(mapLibre.mount).not.toHaveBeenCalled();
    expect(lightweight.mount).toHaveBeenCalledTimes(1);
  });

  it("keeps MapLibre on desktop preview maps", () => {
    const mapLibre = stubEngine();
    const lightweight = stubEngine();
    createRideMapEngine({
      mapLibre: mapLibre.engine,
      lightweight: lightweight.engine,
      platform: linuxDesktop,
    }).mount(document.createElement("div"), viewModel, { onError: vi.fn() });

    expect(mapLibre.mount).toHaveBeenCalledTimes(1);
    expect(lightweight.mount).not.toHaveBeenCalled();
  });
});

describe("prefersLightweightNavigationMap", () => {
  it("recognizes iPad desktop mode", () => {
    expect(
      prefersLightweightNavigationMap({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("does not classify a Mac without touch as iOS", () => {
    expect(
      prefersLightweightNavigationMap({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });
});
