import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import type { MapEngineHandle } from "@/components/map/map-engine";
import type { RequestWeatherOverlay } from "@/components/weather/request-weather-overlay";
import { WEATHER_TOGGLE_LABEL } from "@/components/weather/weather-map-control";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import type { WeatherOverlay } from "@/domain/weather/types";
import type { CarPlayDisplayEvent } from "@/infrastructure/carplay/types";
import { RideApp } from "./ride-app";

const carPlayHarness = vi.hoisted(() => ({
  listeners: new Set<(event: CarPlayDisplayEvent) => void>(),
}));

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

const GRANBY: Coordinates = { latitude: 45.4001, longitude: -72.7342 };

function overlayAt(center: Coordinates): WeatherOverlay {
  return {
    center,
    radiusKm: 60,
    observedAt: new Date().toISOString(),
    samples: [
      {
        coordinates: offsetCoordinates(center, 225, 60),
        precipitationProbability: 90,
        precipitationMmPerHour: 3,
        temperatureC: 15,
        windKph: 25,
      },
      {
        coordinates: offsetCoordinates(center, 45, 60),
        precipitationProbability: 5,
        precipitationMmPerHour: 0,
        temperatureC: 20,
        windKph: 10,
      },
    ],
  };
}

function createHarness() {
  const setWeatherOverlay = vi.fn<(overlay: WeatherOverlay | null) => void>();
  const handle: MapEngineHandle = {
    destroy: vi.fn(),
    setViewModel: vi.fn(),
    setUserLocation: vi.fn(),
    setFollowUser: vi.fn(),
    setGeolocateEnabled: vi.fn(),
    setRecordedTrack: vi.fn(),
    setWeatherOverlay,
    recenter: vi.fn(),
    overview: vi.fn(),
    resize: vi.fn(),
  };
  return { setWeatherOverlay, mapEngine: { mount: vi.fn(() => handle) } };
}

function renderApp(options: {
  harness: ReturnType<typeof createHarness>;
  request?: RequestWeatherOverlay;
  requestPosition?: () => Promise<{
    coordinates: Coordinates;
    accuracyMeters: number | null;
  }>;
}) {
  const request =
    options.request ??
    (vi.fn(async (center: Coordinates) =>
      overlayAt(center),
    ) as unknown as RequestWeatherOverlay);
  render(
    <AppearanceProvider>
      <RideApp
        mapEngine={options.harness.mapEngine}
        requestPosition={
          options.requestPosition ??
          (async () => ({ coordinates: GRANBY, accuracyMeters: 8 }))
        }
        weather={{ request }}
      />
    </AppearanceProvider>,
  );
  return { request };
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

describe("RideApp weather layer (FR-043)", () => {
  it("keeps the layer off — and the network quiet — until the rider asks", () => {
    const harness = createHarness();
    const { request } = renderApp({ harness });

    expect(
      screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("asks for the position once, then paints clouds and names the direction", async () => {
    const harness = createHarness();
    const requestPosition = vi.fn(async () => ({
      coordinates: GRANBY,
      accuracyMeters: 8,
    }));
    const { request } = renderApp({ harness, requestPosition });

    fireEvent.click(screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        GRANBY,
        expect.objectContaining({ radiusKm: expect.any(Number) }),
      );
    });
    expect(requestPosition).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(harness.setWeatherOverlay).toHaveBeenCalledWith(
        expect.objectContaining({ center: GRANBY }),
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "vers le sud-ouest",
    );
  });

  it("clears the map layer when the rider turns the weather back off", async () => {
    const harness = createHarness();
    renderApp({ harness });

    const toggle = screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(harness.setWeatherOverlay).toHaveBeenCalledWith(
        expect.objectContaining({ center: GRANBY }),
      );
    });

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(harness.setWeatherOverlay).toHaveBeenLastCalledWith(null);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the map and the ride usable when the weather service is down", async () => {
    const harness = createHarness();
    const request = vi.fn(async () => {
      throw new Error("Météo indisponible pour le moment.");
    }) as unknown as RequestWeatherOverlay;
    renderApp({ harness, request });

    fireEvent.click(screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Météo indisponible pour le moment.",
      );
    });
    expect(
      screen.getByRole("region", { name: "Carte du trajet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rechercher une destination" }),
    ).toBeInTheDocument();
  });

  it("explains a missing position instead of guessing a sector", async () => {
    const harness = createHarness();
    const { request } = renderApp({
      harness,
      requestPosition: async () => {
        throw new Error("Position refusée");
      },
    });

    fireEvent.click(screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Position inconnue",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
