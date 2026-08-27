import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordedTrackPoint } from "@/domain/recording/types";
import { recordedTrackOverlay } from "./recorded-track-overlay";
import type { RideMapViewModel } from "./ride-map-view-model";

const { mapState, addLayer, fitBounds, createdMarkers, FakeMap, FakeMarker } =
  vi.hoisted(() => {
    const addLayer = vi.fn();
    const fitBounds = vi.fn();
    const createdMarkers: { element?: HTMLElement; removed: boolean }[] = [];
    const mapState = {
      sources: new Map<string, { setData: ReturnType<typeof vi.fn> }>(),
      loadHandlers: [] as Array<() => void>,
      reset() {
        this.sources.clear();
        this.loadHandlers.length = 0;
      },
    };

    class FakeMap {
      painter = {};
      addControl = vi.fn();
      removeControl = vi.fn();
      remove = vi.fn();
      addLayer = addLayer;
      fitBounds = fitBounds;
      easeTo = vi.fn();
      isStyleLoaded = () => true;
      on(event: string, handler: () => void) {
        if (event === "load") {
          mapState.loadHandlers.push(handler);
        }
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

    return { mapState, addLayer, fitBounds, createdMarkers, FakeMap, FakeMarker };
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

vi.mock("./map-3d-buildings", () => ({
  addRideBuildingExtrusions: () => undefined,
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
  directionLabel: "Sens : boucle depuis Granby, QC",
  directionArrows: [],
};

const points: RecordedTrackPoint[] = [
  { latitude: 45.4, longitude: -72.73, timestamp: 1 },
  { latitude: 45.41, longitude: -72.72, timestamp: 2 },
];

function markerLabels(): string[] {
  return createdMarkers
    .filter((marker) => !marker.removed)
    .map((marker) => marker.element?.textContent ?? "")
    .filter(Boolean);
}

describe("createMapLibreEngine recorded track (FR-041)", () => {
  beforeEach(() => {
    mapState.reset();
    addLayer.mockReset();
    fitBounds.mockReset();
    createdMarkers.length = 0;
  });

  it("draws the recorded trace in its own layer, distinct from the route", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine().mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );
    for (const handler of mapState.loadHandlers) {
      handler();
    }

    handle.setRecordedTrack?.(recordedTrackOverlay(points));

    const layerIds = addLayer.mock.calls.map(
      (call) => (call[0] as { id: string }).id,
    );
    expect(layerIds).toContain("ride-recording-line");
    expect(layerIds).toContain("ride-route-line");
    expect(mapState.sources.has("ride-recording")).toBe(true);
  });

  it("updates the existing source as the trace grows", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine().mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );
    for (const handler of mapState.loadHandlers) {
      handler();
    }

    handle.setRecordedTrack?.(recordedTrackOverlay(points));
    const source = mapState.sources.get("ride-recording")!;
    const grown = [...points, { latitude: 45.42, longitude: -72.71, timestamp: 3 }];
    handle.setRecordedTrack?.(recordedTrackOverlay(grown));

    expect(addLayer.mock.calls.filter(
      (call) => (call[0] as { id: string }).id === "ride-recording-line",
    )).toHaveLength(1);
    // La source est créée vide au chargement du style, puis mise à jour.
    expect(source.setData).toHaveBeenCalledTimes(2);
    expect(source.setData.mock.calls.at(-1)![0]).toMatchObject({
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.73, 45.4],
          [-72.72, 45.41],
          [-72.71, 45.42],
        ],
      },
    });
  });

  it("shows a start marker while recording and adds the arrival marker on stop", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine().mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );
    for (const handler of mapState.loadHandlers) {
      handler();
    }

    handle.setRecordedTrack?.(recordedTrackOverlay(points));
    expect(markerLabels()).toContain("Départ");
    expect(markerLabels().filter((label) => label === "Arrivée")).toHaveLength(0);

    handle.setRecordedTrack?.(recordedTrackOverlay(points, { completed: true }));
    expect(markerLabels()).toContain("Arrivée");
  });

  it("frames the whole track once the recording stops", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine().mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );
    for (const handler of mapState.loadHandlers) {
      handler();
    }
    fitBounds.mockReset();

    handle.setRecordedTrack?.(recordedTrackOverlay(points));
    expect(fitBounds).not.toHaveBeenCalled();

    handle.setRecordedTrack?.(recordedTrackOverlay(points, { completed: true }));
    expect(fitBounds).toHaveBeenCalledTimes(1);
    const [[west, south], [east, north]] = fitBounds.mock.calls[0]![0] as [
      [number, number],
      [number, number],
    ];
    expect(west).toBeCloseTo(-72.73, 5);
    expect(south).toBeCloseTo(45.4, 5);
    expect(east).toBeCloseTo(-72.72, 5);
    expect(north).toBeCloseTo(45.41, 5);
  });

  it("clears the trace and its markers when the recording is discarded", async () => {
    const { createMapLibreEngine } = await import("./maplibre-map-engine");
    const handle = createMapLibreEngine().mount(
      document.createElement("div"),
      viewModel,
      { onError: vi.fn() },
    );
    for (const handler of mapState.loadHandlers) {
      handler();
    }

    handle.setRecordedTrack?.(recordedTrackOverlay(points, { completed: true }));
    const source = mapState.sources.get("ride-recording")!;
    handle.setRecordedTrack?.(null);

    expect(markerLabels().filter((label) => label === "Arrivée")).toHaveLength(0);
    const lastCall = source.setData.mock.calls.at(-1)![0] as {
      geometry: { coordinates: unknown[] };
    };
    expect(lastCall.geometry.coordinates).toEqual([]);
  });
});
