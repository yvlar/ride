import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import { RideApp } from "./ride-app";
import type { Place } from "@/domain/geo/types";
import { gpxFileInputAccept } from "@/domain/gpx/file-accept";
import type { GenerateRideRequest, GenerateRideResult, GeneratedDestinationRoute, GeneratedLoopRoute } from "@/domain/ride/types";
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

const tremblant: Place = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

const destinationRoute: GeneratedDestinationRoute = {
  id: "dest-1",
  type: "destination",
  start: granby,
  destination: tremblant,
  style: "scenic",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-74.596, 46.118],
    ],
  },
  segments: [],
  distanceKm: 118.4,
  durationMinutes: 105,
  warnings: [],
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
  it("does not expose a dedicated loop action on the explorer (FR-031, FR-034)", () => {
    render(
      <AppearanceProvider>
        <RideApp mapEngine={stubMapEngine()} />
      </AppearanceProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Créer une boucle moto" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Décrire mon trajet" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Importer un fichier GPX" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Rechercher une destination" }),
    ).toBeEnabled();
  });

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
    expect(screen.queryByRole("button", { name: "Annuler la navigation" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "Annuler la navigation" })).not.toBeInTheDocument();
  });

  it("restores mute and RAG preferences from the session (FR-035)", async () => {
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
        muted: true,
        useKnowledgeRouting: true,
        savedAtMs: 1,
      }),
    );

    render(
      <AppearanceProvider>
        <RideApp mapEngine={stubMapEngine()} />
      </AppearanceProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Reprendre la navigation" }),
    );
    expect(screen.getByText(/Guidage vocal désactivé/)).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Guidage vocal" }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la demande" }));
    expect(screen.getByRole("switch", { name: "Corridors RAG" })).toBeChecked();
  });

  it("keeps shell and form navigation state aligned after a CarPlay catalog pick (FR-033, FR-036)", async () => {
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    );
    expect(screen.getByRole("button", { name: "Annuler la navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explorer" })).not.toBeInTheDocument();

    act(() => {
      carPlayHarness.emit({ type: "catalogSelect", id: "saved:saved-1" });
    });

    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Explorer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Annuler la navigation" })).not.toBeInTheDocument();
  });

  it("generates an AI loop in place from the distance slider (FR-034, FR-011)", async () => {
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
    const requestPosition = vi.fn(async () => ({
      coordinates: granby.coordinates,
      accuracyMeters: 8,
    }));

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={{ mount }}
          generateRide={generateRide}
          requestPosition={requestPosition}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    expect(
      await screen.findByRole("slider", {
        name: "Distance du trajet en kilomètres",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Votre demande")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Durée disponible/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Point de départ")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Boucle")).toBeChecked();
    fireEvent.change(
      screen.getByRole("slider", { name: "Distance du trajet en kilomètres" }),
      { target: { value: "80" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));

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
          targetDistanceKm: 80,
        }),
        expect.objectContaining({
          useAiWebGeneration: true,
          originAccuracyMeters: 8,
          returnToStart: true,
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
    const recenter = vi.fn();
    const setFollowUser = vi.fn();
    const setGeolocateEnabled = vi.fn();
    const mount = vi.fn(() => ({
      destroy,
      setViewModel: vi.fn(),
      setFollowUser,
      setGeolocateEnabled,
      setUserLocation: vi.fn(),
      recenter,
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
          generateRide={generateRide}
          requestPosition={async () => ({
            coordinates: granby.coordinates,
            accuracyMeters: 8,
          })}
          navigation={{ locationWatch, speech }}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    fireEvent.click(await screen.findByRole("button", { name: "Générer mon trajet" }));
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
    expect(recenter).toHaveBeenCalled();
    expect(generateRide).toHaveBeenCalledTimes(generateCalls);
    expect(destroy).not.toHaveBeenCalled();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Composer le trajet" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Annuler la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
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
          generateRide={generateRide}
          regenerateRide={regenerateRide}
          requestPosition={async () => ({
            coordinates: granby.coordinates,
            accuracyMeters: 8,
          })}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    fireEvent.click(await screen.findByRole("button", { name: "Générer mon trajet" }));
    fireEvent.click(await screen.findByRole("button", { name: "Régénérer" }));

    await waitFor(() => {
      expect(regenerateRide).toHaveBeenCalledTimes(1);
    });
    expect(regenerateRide).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "loop",
      }),
      expect.objectContaining({ id: loop.id }),
      expect.objectContaining({ useAiWebGeneration: true }),
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
          generateRide={async () => ({ ok: true, route: loop })}
          requestPosition={async () => ({
            coordinates: granby.coordinates,
            accuracyMeters: 8,
          })}
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
    fireEvent.click(await screen.findByRole("button", { name: "Générer mon trajet" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    );

    expect(
      await screen.findByText("L’autorisation de localisation a été refusée."),
    ).toBeInTheDocument();
  });

  it("generates, starts, cancels and generates again without reload (FR-038)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: destinationRoute,
    }));
    const unsubscribeWatch = vi.fn();
    const locationWatch = {
      start: vi.fn(),
      subscribe: vi.fn(() => unsubscribeWatch),
      activeNativeWatches: () => 0,
    };
    const speech = {
      available: true,
      speak: vi.fn(),
      cancel: vi.fn(),
      setMuted: vi.fn(),
      unlock: vi.fn(),
    };

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={stubMapEngine()}
          generateRide={generateRide}
          debounceMs={0}
          searchPlaces={async () => [tremblant]}
          requestPosition={async () => ({
            coordinates: granby.coordinates,
            accuracyMeters: 8,
          })}
          reversePlace={async (coordinates) => ({
            label: granby.label,
            coordinates,
          })}
          navigation={{ locationWatch, speech }}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Rechercher une destination" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Trouver une destination" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Point de départ")).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Adresse, ville ou code postal",
      }),
      { target: { value: "Mont" } },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Mont-Tremblant" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    const start = await screen.findByRole("button", {
      name: "Démarrer la navigation",
    });
    const generateCalls = generateRide.mock.calls.length;
    fireEvent.click(start);
    fireEvent.click(start);
    expect(
      await screen.findByRole("dialog", { name: "Navigation" }),
    ).toBeInTheDocument();
    expect(generateRide).toHaveBeenCalledTimes(generateCalls);
    expect(locationWatch.start).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("dialog", { name: "Navigation" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Annuler la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
    expect(
      await screen.findByRole("heading", { name: "Trouver une destination" }),
    ).toBeInTheDocument();
    expect(unsubscribeWatch).toHaveBeenCalled();
    expect(speech.cancel).toHaveBeenCalled();
    expect(screen.getByRole("combobox", {
      name: "Adresse, ville ou code postal",
    })).toHaveValue(
      "Mont-Tremblant",
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Générer le trajet" }),
      ).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(generateRide.mock.calls.length).toBeGreaterThan(generateCalls);
    expect(
      screen.queryByRole("heading", { name: "Composer le trajet" }),
    ).not.toBeInTheDocument();
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

describe("RideApp route preferences (FR-031, FR-007, FR-008, FR-030)", () => {
  it("stores Réglages switches and applies them to Décrire mon trajet", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));

    render(
      <AppearanceProvider>
        <RideApp
          mapEngine={stubMapEngine()}
          generateRide={generateRide}
          requestPosition={async () => ({
            coordinates: granby.coordinates,
            accuracyMeters: 8,
          })}
        />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Réglages" }));
    expect(screen.getByLabelText("Éviter les autoroutes")).toBeChecked();
    expect(screen.getByLabelText("Éviter les routes non pavées")).toBeChecked();
    expect(screen.getByLabelText("Canada seulement")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Canada seulement"));
    fireEvent.click(screen.getByLabelText("Éviter les autoroutes"));
    expect(screen.getByLabelText("Canada seulement")).toBeChecked();
    expect(screen.getByLabelText("Éviter les autoroutes")).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Explorer" }));
    fireEvent.click(screen.getByRole("button", { name: "Réglages" }));
    expect(screen.getByLabelText("Canada seulement")).toBeChecked();
    expect(screen.getByLabelText("Éviter les autoroutes")).not.toBeChecked();
    expect(screen.getByLabelText("Éviter les routes non pavées")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Explorer" }));
    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    expect(screen.queryByLabelText("Éviter les autoroutes")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Canada seulement")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Générer mon trajet" }));
    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: {
            avoidHighways: false,
            avoidUnpaved: true,
            stayInCanada: true,
          },
        }),
        expect.objectContaining({ useAiWebGeneration: true }),
      );
    });
  });
});

describe("RideApp GPX import (FR-039)", () => {
  it("opens the GPX importer without replacing Trouver une destination", async () => {
    render(
      <AppearanceProvider>
        <RideApp mapEngine={stubMapEngine()} />
      </AppearanceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Importer un fichier GPX" }));
    expect(
      screen.getByRole("heading", { name: "Importer un fichier GPX" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("gpx-file-input")).toHaveAttribute(
      "accept",
      gpxFileInputAccept(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(
      screen.getByRole("button", { name: "Rechercher une destination" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rechercher une destination" }));
    expect(
      screen.getByRole("heading", { name: "Trouver une destination" }),
    ).toBeInTheDocument();
  });

  it("drops a cancelled GPX preview from session storage and Mes trajets (FR-039)", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Cantons</name>
    <trkseg>
      <trkpt lat="45.4000" lon="-72.7300"/>
      <trkpt lat="45.4100" lon="-72.7100"/>
    </trkseg>
  </trk>
</gpx>`;
    render(
      <AppearanceProvider>
        <RideApp mapEngine={stubMapEngine()} />
      </AppearanceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Importer un fichier GPX" }));
    const input = screen.getByTestId("gpx-file-input") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([xml], "cantons.gpx", { type: "application/gpx+xml" })] },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Démarrer la navigation" })).toBeEnabled();
    });
    expect(window.sessionStorage.getItem(RIDE_SESSION_STORAGE_KEY)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(window.sessionStorage.getItem(RIDE_SESSION_STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mes trajets" }));
    expect(screen.queryByText("Cantons")).not.toBeInTheDocument();
    expect(
      screen.getByText("Aucun trajet généré dans cette session."),
    ).toBeInTheDocument();
  });

  it("keeps the GPX preview when choosing another file without selecting one (FR-039)", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Cantons</name>
    <trkseg>
      <trkpt lat="45.4000" lon="-72.7300"/>
      <trkpt lat="45.4100" lon="-72.7100"/>
    </trkseg>
  </trk>
</gpx>`;
    render(
      <AppearanceProvider>
        <RideApp mapEngine={stubMapEngine()} />
      </AppearanceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Importer un fichier GPX" }));
    const input = screen.getByTestId("gpx-file-input") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([xml], "cantons.gpx", { type: "application/gpx+xml" })] },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Démarrer la navigation" })).toBeEnabled();
    });
    const snapshot = window.sessionStorage.getItem(RIDE_SESSION_STORAGE_KEY);
    expect(snapshot).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choisir un autre fichier" }));
    expect(window.sessionStorage.getItem(RIDE_SESSION_STORAGE_KEY)).toBe(snapshot);
    expect(screen.getByText("Cantons")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Démarrer la navigation" })).toBeEnabled();
  });

  it("does not store a GPX preview if the user leaves Explore during a deferred <rte> snap (FR-039)", async () => {
    let releaseSnap: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/routes/snap-waypoints")) {
        return new Promise<Response>((resolve) => {
          releaseSnap = resolve;
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(
        <AppearanceProvider>
          <RideApp mapEngine={stubMapEngine()} />
        </AppearanceProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Importer un fichier GPX" }));
      const input = screen.getByTestId("gpx-file-input") as HTMLInputElement;
      fireEvent.change(input, {
        target: {
          files: [
            new File(
              [
                `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>Route 112</name>
    <rtept lat="45.40" lon="-72.73"/>
    <rtept lat="45.41" lon="-72.60"/>
  </rte>
</gpx>`,
              ],
              "route-112.gpx",
              { type: "application/gpx+xml" },
            ),
          ],
        },
      });
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      fireEvent.click(screen.getByRole("button", { name: "Mes trajets" }));
      expect(
        screen.getByText("Aucun trajet généré dans cette session."),
      ).toBeInTheDocument();
      await act(async () => {
        releaseSnap?.(
          new Response(
            JSON.stringify({
              data: {
                route: {
                  geometry: {
                    type: "LineString",
                    coordinates: [
                      [-72.73, 45.4],
                      [-72.6, 45.41],
                    ],
                  },
                  segments: [],
                  distanceKm: 10,
                  durationMinutes: 12,
                },
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      });
      expect(
        screen.getByText("Aucun trajet généré dans cette session."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Route 112")).not.toBeInTheDocument();
      expect(window.sessionStorage.getItem(RIDE_SESSION_STORAGE_KEY)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
