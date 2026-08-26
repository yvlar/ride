import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Coordinates } from "@/domain/geo/types";

const {
  addControl,
  mapRemove,
  markerRemove,
  eventHandlers,
  createdMarkers,
  FakeMap,
  FakeMarker,
  FakeNavigationControl,
} = vi.hoisted(() => {
  const addControl = vi.fn();
  const mapRemove = vi.fn();
  const markerRemove = vi.fn();
  const eventHandlers = new Map<string, (event: unknown) => void>();
  const createdMarkers: Array<{
    options?: Record<string, unknown>;
    lngLat: { lng: number; lat: number };
    handlers: Map<string, () => void>;
  }> = [];

  class FakeMap {
    painter = {};
    addControl = addControl;
    remove = mapRemove;
    isStyleLoaded = () => true;
    on(name: string, handler: (event: unknown) => void) {
      eventHandlers.set(name, handler);
      return this;
    }
  }

  class FakeMarker {
    options?: Record<string, unknown>;
    lngLat = { lng: 0, lat: 0 };
    handlers = new Map<string, () => void>();

    constructor(options?: Record<string, unknown>) {
      this.options = options;
      createdMarkers.push(this);
    }

    setLngLat(value: [number, number]) {
      this.lngLat = { lng: value[0], lat: value[1] };
      return this;
    }

    getLngLat() {
      return this.lngLat;
    }

    addTo() {
      return this;
    }

    on(name: string, handler: () => void) {
      this.handlers.set(name, handler);
      return this;
    }

    remove = markerRemove;
  }

  class FakeNavigationControl {}

  return {
    addControl,
    mapRemove,
    markerRemove,
    eventHandlers,
    createdMarkers,
    FakeMap,
    FakeMarker,
    FakeNavigationControl,
  };
});

vi.mock("maplibre-gl", () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: FakeNavigationControl,
}));

vi.mock("./maplibre-worker-url", () => ({
  ensureMapLibreWorkerUrl: () => undefined,
}));

const center = { latitude: 45.4001, longitude: -72.7342 };

describe("createMapLibreDestinationPickerEngine", () => {
  beforeEach(() => {
    addControl.mockReset();
    mapRemove.mockReset();
    markerRemove.mockReset();
    eventHandlers.clear();
    createdMarkers.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("places a draggable marker on click and reports its moved coordinates", async () => {
    const { createMapLibreDestinationPickerEngine } = await import(
      "./maplibre-destination-picker-engine"
    );
    const onPick = vi.fn();
    const handle = createMapLibreDestinationPickerEngine().mount(
      document.createElement("div"),
      { center },
      { onPick, onError: vi.fn() },
    );

    eventHandlers.get("click")?.({ lngLat: { lat: 45.5, lng: -72.4 } });
    expect(onPick).toHaveBeenCalledWith({ latitude: 45.5, longitude: -72.4 });
    expect(createdMarkers).toHaveLength(1);
    expect(createdMarkers[0]?.options?.draggable).toBe(true);

    const marker = createdMarkers[0];
    if (!marker) {
      throw new Error("Destination marker missing");
    }
    marker.lngLat = { lat: 45.6, lng: -72.3 };
    marker.handlers.get("dragend")?.();
    expect(onPick).toHaveBeenLastCalledWith({
      latitude: 45.6,
      longitude: -72.3,
    });

    handle.destroy();
    expect(markerRemove).toHaveBeenCalled();
    expect(mapRemove).toHaveBeenCalled();
  });

  it("places a marker after a mobile long press", async () => {
    vi.useFakeTimers();
    const { createMapLibreDestinationPickerEngine } = await import(
      "./maplibre-destination-picker-engine"
    );
    const onPick = vi.fn<(coordinates: Coordinates) => void>();
    createMapLibreDestinationPickerEngine().mount(
      document.createElement("div"),
      { center, userLocation: center },
      { onPick, onError: vi.fn() },
    );

    eventHandlers.get("touchstart")?.({
      lngLats: [{ lat: 45.55, lng: -72.35 }],
    });
    vi.advanceTimersByTime(550);

    expect(onPick).toHaveBeenCalledWith({
      latitude: 45.55,
      longitude: -72.35,
    });
    expect(createdMarkers).toHaveLength(2);
  });
});
