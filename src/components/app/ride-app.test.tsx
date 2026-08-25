import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import { RideApp } from "./ride-app";
import type { Place } from "@/domain/geo/types";
import type { GenerateRideRequest, GenerateRideResult, GeneratedLoopRoute } from "@/domain/ride/types";
import type { MapEngine } from "@/components/map/map-engine";
import type { LocationWatch } from "@/domain/location/types";
import type { CarPlayDisplayEvent } from "@/infrastructure/carplay/types";
import { RIDE_SESSION_STORAGE_KEY } from "@/domain/ride/session-snapshot";

const carPlayHarness = vi.hoisted(() => {
  const listeners = new Set<(event: CarPlayDisplayEvent) => void>();
  return {
    listeners,
    emit(event: CarPlayDisplayEvent) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
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
  id: "saved-1",
  type: "loop",
  start: granby,
  targetDistanceKm: 80,
  style: "curvy",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
    ],
  },
  segments: [],
  distanceKm: 80,
  durationMinutes: 70,
  statistics: { repeatedRoadPercent: 2 },
  warnings: [],
};

function stubMapEngine(): MapEngine {
  return { mount: vi.fn(() => ({ destroy: vi.fn() })) };
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

describe("RideApp mobile shell (FR-031, FR-035)", () => {
  it("starts a saved ride in three interactions", async () => {
    window.localStorage.setItem(
      "ride.library.v1",
      JSON.stringify({
        recents: [],
        saved: [
          {
            id: "saved-1",
            name: "Boucle · Granby, QC",
            savedAtMs: 1,
            request: {
              type: "loop",
              start: granby,
              targetDistanceKm: 80,
              style: "curvy",
            } satisfies GenerateRideRequest,
            route: loop,
          },
        ],
      }),
    );

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={stubMapEngine()}
          generateRide={async (): Promise<GenerateRideResult> => ({
            ok: true,
            route: loop,
          })}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enregistrés" }));
    fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));
    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
  });

  it("opens pre-departure from a CarPlay saved ride (FR-033, FR-028)", async () => {
    window.localStorage.setItem(
      "ride.library.v1",
      JSON.stringify({
        recents: [],
        saved: [
          {
            id: "saved-1",
            name: "Boucle · Granby, QC",
            savedAtMs: 1,
            request: {
              type: "loop",
              start: granby,
              targetDistanceKm: 80,
              style: "curvy",
            } satisfies GenerateRideRequest,
            route: loop,
          },
        ],
      }),
    );

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={stubMapEngine()}
          generateRide={async (): Promise<GenerateRideResult> => ({
            ok: true,
            route: loop,
          })}
        />
      </AppearanceProvider>,
    );

    await screen.findByRole("button", { name: "Boucle · Granby, QC" });
    act(() => {
      carPlayHarness.emit({ type: "catalogSelect", id: "saved:saved-1" });
    });

    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Arrêter" })).not.toBeInTheDocument();
  });

  it("opens pre-departure from CarPlay resume of a composed route (FR-033)", async () => {
    window.sessionStorage.setItem(
      RIDE_SESSION_STORAGE_KEY,
      JSON.stringify({
        request: {
          type: "loop",
          start: granby,
          targetDistanceKm: 80,
          style: "curvy",
        } satisfies GenerateRideRequest,
        route: loop,
        navigating: false,
        muted: false,
        useKnowledgeRouting: false,
        savedAtMs: 1,
      }),
    );

    render(
      <AppearanceProvider>
        <RideApp mapEngine={stubMapEngine()} />
      </AppearanceProvider>,
    );

    await screen.findByRole("button", { name: "Reprendre la navigation" });
    act(() => {
      carPlayHarness.emit({ type: "catalogSelect", id: "resume" });
    });

    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Arrêter" })).not.toBeInTheDocument();
  });

  it("parses a natural-language loop without inventing geometry and generates in place (FR-034, FR-011)", async () => {
    const setViewModel = vi.fn();
    const mount = vi.fn(() => ({
      destroy: vi.fn(),
      setViewModel,
      setFollowUser: vi.fn(),
      setGeolocateEnabled: vi.fn(),
    }));
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const searchPlaces = vi.fn(async (query: string): Promise<Place[]> =>
      query.toLowerCase().includes("granby") ? [granby] : [],
    );

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={{ mount }}
          searchPlaces={searchPlaces}
          debounceMs={0}
          generateRide={generateRide}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    fireEvent.change(screen.getByLabelText("Votre demande"), {
      target: {
        value:
          "Crée une boucle de 250 km au départ de Granby, avec des routes sinueuses, sans autoroute et uniquement asphaltées.",
      },
    });
    expect(
      screen.getByText(/ces critères seront calculés par le moteur de routage/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Routes sinueuses" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Éviter les autoroutes")).toBeChecked();
    expect(screen.getByLabelText("Éviter les routes non pavées")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));

    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Régénérer" })).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: "Composer le trajet" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Décrire mon trajet" })).toBeInTheDocument();
    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "loop",
          start: granby,
          targetDistanceKm: 250,
          style: "curvy",
        }),
      );
    });
    await waitFor(() => {
      expect(setViewModel).toHaveBeenCalled();
    });
  });

  it("starts guided navigation on the same map without generating again (FR-023, FR-034)", async () => {
    const listeners = new Set<(event: { type: string }) => void>();
    const locationWatch = {
      start: vi.fn(),
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
      activeNativeWatches: () => listeners.size,
    };
    const speech = {
      available: true,
      speak: vi.fn(),
      cancel: vi.fn(),
      setMuted: vi.fn(),
      unlock: vi.fn(),
    };
    const destroy = vi.fn();
    const setFollowUser = vi.fn();
    const setGeolocateEnabled = vi.fn();
    const mount = vi.fn(() => ({
      destroy,
      setViewModel: vi.fn(),
      setFollowUser,
      setGeolocateEnabled,
      setUserLocation: vi.fn(),
      recenter: vi.fn(),
      resize: vi.fn(),
    }));
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={{ mount }}
          searchPlaces={async () => [granby]}
          debounceMs={0}
          generateRide={generateRide}
          navigation={{ locationWatch, speech }}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    fireEvent.change(screen.getByLabelText("Votre demande"), {
      target: {
        value: "Crée une boucle de 250 km au départ de Granby.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));
    const start = await screen.findByRole("button", {
      name: "Démarrer la navigation",
    });
    const generateCalls = generateRide.mock.calls.length;
    fireEvent.click(start);

    expect(
      await screen.findByRole("dialog", { name: "Navigation" }),
    ).toBeInTheDocument();
    expect(locationWatch.start).toHaveBeenCalledTimes(1);
    expect(speech.unlock).toHaveBeenCalledTimes(1);
    expect(generateRide).toHaveBeenCalledTimes(generateCalls);
    expect(destroy).not.toHaveBeenCalled();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Composer le trajet" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Arrêter" }));
    fireEvent.click(screen.getByRole("button", { name: "Terminer" }));
    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Régénérer" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Décrire mon trajet" })).toBeInTheDocument();
  });

  it("regenerates from the same describe criteria without leaving the view (FR-012, FR-034)", async () => {
    const variant: GeneratedLoopRoute = { ...loop, id: "saved-2", distanceKm: 82 };
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const regenerateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: variant,
    }));

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={stubMapEngine()}
          searchPlaces={async () => [granby]}
          debounceMs={0}
          generateRide={generateRide}
          regenerateRide={regenerateRide}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    fireEvent.change(screen.getByLabelText("Votre demande"), {
      target: {
        value: "Crée une boucle de 80 km au départ de Granby, routes sinueuses.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));
    fireEvent.click(await screen.findByRole("button", { name: "Régénérer" }));

    await waitFor(() => {
      expect(regenerateRide).toHaveBeenCalledTimes(1);
    });
    expect(regenerateRide).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "loop",
        start: granby,
        style: "curvy",
      }),
      expect.objectContaining({ id: loop.id }),
    );
    expect(
      screen.queryByRole("heading", { name: "Composer le trajet" }),
    ).not.toBeInTheDocument();
  });

  it("shows a GPS permission message during describe navigation (FR-023, FR-033)", async () => {
    const locationWatch: LocationWatch = {
      start: vi.fn(),
      subscribe: vi.fn((listener) => {
        listener({
          type: "error",
          error: {
            code: "PERMISSION_DENIED",
            message: "L’autorisation de localisation a été refusée.",
          },
        });
        return () => {};
      }),
      activeNativeWatches: () => 0,
    };

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={stubMapEngine()}
          searchPlaces={async () => [granby]}
          debounceMs={0}
          generateRide={async () => ({ ok: true, route: loop })}
          navigation={{
            locationWatch,
            speech: {
              available: true,
              speak: vi.fn(),
              cancel: vi.fn(),
              setMuted: vi.fn(),
              unlock: vi.fn(),
            },
          }}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    fireEvent.change(screen.getByLabelText("Votre demande"), {
      target: {
        value: "Crée une boucle de 80 km au départ de Granby.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    );

    expect(
      await screen.findByText("L’autorisation de localisation a été refusée."),
    ).toBeInTheDocument();
  });
});

describe("RideApp appearance (FR-037)", () => {
  it("exposes light, dark and night modes", () => {
    render(
      <AppearanceProvider>
        <RideApp mapEngine={stubMapEngine()} />
      </AppearanceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Réglages" }));
    expect(screen.getByRole("radio", { name: "Clair" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sombre" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Clair" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    fireEvent.click(screen.getByRole("radio", { name: "Navigation nocturne" }));
    expect(document.documentElement.classList.contains("night")).toBe(true);
  });
});
