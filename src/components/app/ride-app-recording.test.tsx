import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import type { MapEngineHandle } from "@/components/map/map-engine";
import type { RecordedTrackOverlay } from "@/components/map/recorded-track-overlay";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Place } from "@/domain/geo/types";
import type { LocationWatchEvent } from "@/domain/location/types";
import type { CarPlayDisplayEvent } from "@/infrastructure/carplay/types";
import type { GenerateRideResult, GeneratedLoopRoute } from "@/domain/ride/types";
import { RideApp } from "./ride-app";

const carPlayHarness = vi.hoisted(() => {
  const listeners = new Set<(event: CarPlayDisplayEvent) => void>();
  return { listeners };
});

vi.mock("@/infrastructure/carplay/create-carplay-display", () => ({
  createCarPlayDisplay: () => ({
    async start() {
      return { connected: false, ownsVoice: false };
    },
    async update() {},
    async stop() {},
    async setCatalog() {},
    subscribe(listener: (event: CarPlayDisplayEvent) => void) {
      carPlayHarness.listeners.add(listener);
      return () => {
        carPlayHarness.listeners.delete(listener);
      };
    },
  }),
}));

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const loop: GeneratedLoopRoute = {
  id: "loop-rec-1",
  type: "loop",
  start: granby,
  targetDistanceKm: 80,
  style: "curvy",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
      [-72.7342, 45.4001],
    ],
  },
  segments: [],
  distanceKm: 80,
  durationMinutes: 90,
  warnings: [],
  statistics: { repeatedRoadPercent: 2 },
};

const START_MS = new Date(2026, 7, 25, 14, 30, 0).getTime();

function fixEvent(index: number): LocationWatchEvent {
  const moved = offsetCoordinates(granby.coordinates, 90, (index * 60) / 1_000);
  return {
    type: "fix",
    fix: {
      coordinates: moved,
      accuracyMeters: 6,
      altitudeMeters: 130,
      recordedAtMs: START_MS + index * 2_000,
    },
  };
}

function createHarness() {
  const listeners = new Set<(event: LocationWatchEvent) => void>();
  const setRecordedTrack = vi.fn<(overlay: RecordedTrackOverlay | null) => void>();
  const setGeolocateEnabled = vi.fn<(enabled: boolean) => void>();
  const locationWatch = {
    start: vi.fn(),
    subscribe: vi.fn((listener: (event: LocationWatchEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    activeNativeWatches: () => (listeners.size > 0 ? 1 : 0),
  };
  const handle: MapEngineHandle = {
    destroy: vi.fn(),
    setViewModel: vi.fn(),
    setUserLocation: vi.fn(),
    setFollowUser: vi.fn(),
    setGeolocateEnabled,
    setRecordedTrack,
    recenter: vi.fn(),
    overview: vi.fn(),
    resize: vi.fn(),
  };
  return {
    locationWatch,
    speech: {
      available: true,
      speak: vi.fn(),
      cancel: vi.fn(),
      setMuted: vi.fn(),
      unlock: vi.fn(),
    },
    mapEngine: { mount: vi.fn(() => handle) },
    setRecordedTrack,
    setGeolocateEnabled,
    subscriberCount: () => listeners.size,
    emit(event: LocationWatchEvent) {
      act(() => {
        for (const listener of [...listeners]) {
          listener(event);
        }
      });
    },
  };
}

function renderApp(harness: ReturnType<typeof createHarness>) {
  return render(
    <AppearanceProvider>
      <RideApp
        mapEngine={harness.mapEngine}
        generateRide={async (): Promise<GenerateRideResult> => ({
          ok: true,
          route: loop,
        })}
        requestPosition={async () => ({
          coordinates: granby.coordinates,
          accuracyMeters: 8,
        })}
        navigation={{ locationWatch: harness.locationWatch, speech: harness.speech }}
        recording={{ now: () => START_MS, exportFile: async () => "download" }}
      />
    </AppearanceProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  carPlayHarness.listeners.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  carPlayHarness.listeners.clear();
});

describe("RideApp live recording (FR-041)", () => {
  it("offers the recording action on the explorer map", () => {
    const harness = createHarness();
    renderApp(harness);
    expect(
      screen.getByRole("button", { name: /Démarrer l’enregistrement/ }),
    ).toBeInTheDocument();
    expect(harness.subscriberCount()).toBe(0);
  });

  it("records without calling the ride generator or the routing engine", async () => {
    const harness = createHarness();
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={harness.mapEngine}
          generateRide={generateRide}
          navigation={{ locationWatch: harness.locationWatch, speech: harness.speech }}
          recording={{ now: () => START_MS }}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
    harness.emit(fixEvent(0));
    harness.emit(fixEvent(1));

    expect(screen.getByText("Enregistrement en cours")).toBeInTheDocument();
    expect(generateRide).not.toHaveBeenCalled();
  });

  it("reuses the shared GPS watch and turns the map GPS control off", async () => {
    const harness = createHarness();
    renderApp(harness);

    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
    harness.emit(fixEvent(0));

    expect(harness.locationWatch.start).toHaveBeenCalledTimes(1);
    expect(harness.subscriberCount()).toBe(1);
    await waitFor(() =>
      expect(harness.setGeolocateEnabled).toHaveBeenLastCalledWith(false),
    );
  });

  it("pushes the growing trace to the map engine", async () => {
    const harness = createHarness();
    renderApp(harness);

    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
    harness.emit(fixEvent(0));
    harness.emit(fixEvent(1));

    await waitFor(() => {
      const overlay = harness.setRecordedTrack.mock.calls.at(-1)?.[0];
      expect(overlay?.geometry.coordinates).toHaveLength(2);
      expect(overlay?.fitBounds).toBe(false);
    });
  });

  it("frames the whole track and shows both markers once stopped", async () => {
    const harness = createHarness();
    renderApp(harness);

    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
    harness.emit(fixEvent(0));
    harness.emit(fixEvent(1));
    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    await waitFor(() => {
      const overlay = harness.setRecordedTrack.mock.calls.at(-1)?.[0];
      expect(overlay?.fitBounds).toBe(true);
      expect(overlay?.startPoint).not.toBeNull();
      expect(overlay?.endPoint).not.toBeNull();
    });
    expect(harness.subscriberCount()).toBe(0);
  });

  it("keeps recording while a guided navigation runs (FR-023)", async () => {
    const harness = createHarness();
    renderApp(harness);

    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
    harness.emit(fixEvent(0));
    harness.emit(fixEvent(1));

    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    fireEvent.click(await screen.findByRole("button", { name: "Générer mon trajet" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    );
    expect(await screen.findByRole("dialog", { name: "Navigation" })).toBeInTheDocument();

    harness.emit(fixEvent(2));

    expect(screen.getByText("Enregistrement en cours")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Arrêter l’enregistrement/ }),
    ).toBeInTheDocument();
    await waitFor(() => {
      const overlay = harness.setRecordedTrack.mock.calls.at(-1)?.[0];
      expect(overlay?.geometry.coordinates).toHaveLength(3);
    });
  });

  it("removes the trace from the map when the rider deletes the recording", async () => {
    const harness = createHarness();
    renderApp(harness);

    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
    harness.emit(fixEvent(0));
    harness.emit(fixEvent(1));
    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Supprimer$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Supprimer définitivement/ }));

    await waitFor(() =>
      expect(harness.setRecordedTrack.mock.calls.at(-1)?.[0]).toBeNull(),
    );
    expect(harness.subscriberCount()).toBe(0);
    expect(
      screen.getByRole("button", { name: /Démarrer l’enregistrement/ }),
    ).toBeInTheDocument();
  });
});
