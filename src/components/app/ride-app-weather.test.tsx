import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import type { MapEngine, MapEngineHandle } from "@/components/map/map-engine";
import type { WeatherMapOverlay } from "@/components/map/weather-overlay";
import { RideApp } from "./ride-app";

vi.mock("@/infrastructure/carplay/create-carplay-display", () => ({
  createCarPlayDisplay: () => ({
    async start() {
      return { connected: false, ownsVoice: false };
    },
    async update() {},
    async stop() {},
    async setCatalog() {},
    subscribe() {
      return () => {};
    },
  }),
}));

const report = {
  data: {
    field: {
      center: { latitude: 45.5, longitude: -72.75 },
      radiusKm: 45,
      observedAtIso: "2026-08-29T15:00:00.000Z",
      samples: [
        {
          coordinates: { latitude: 45.1, longitude: -72.75 },
          precipitationProbability: 88,
          precipitationMmPerHour: 4,
          cloudCover: 96,
          thunder: false,
          temperatureC: 18,
          windSpeedKmh: 22,
        },
      ],
    },
    radar: { frames: [], attribution: null, maxZoom: null },
    advice: {
      localRisk: 0,
      localLevel: "clear",
      sectors: [],
      avoid: null,
      escape: null,
      headline: "serveur",
      detail: "serveur",
    },
  },
  meta: { requestId: "test" },
};

function weatherEngine(): {
  engine: MapEngine;
  overlays: (WeatherMapOverlay | null)[];
} {
  const overlays: (WeatherMapOverlay | null)[] = [];
  const engine: MapEngine = {
    mount: (): MapEngineHandle => ({
      destroy() {},
      setWeather(overlay) {
        overlays.push(overlay);
      },
    }),
  };
  return { engine, overlays };
}

function stubFetch() {
  const fetcher = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(report), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RideApp weather layer (FR-043)", () => {
  it("opens the explorer with the live weather layer and no switch", async () => {
    const fetcher = stubFetch();
    const { engine, overlays } = weatherEngine();

    render(
      <AppearanceProvider>
        <RideApp mapEngine={engine} />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(overlays.at(-1)?.clouds).toHaveLength(1);
    });
    expect(
      screen.queryByRole("button", { name: "Météo" }),
    ).not.toBeInTheDocument();
  });

  it("draws the clouds without a panel over the map", async () => {
    const fetcher = stubFetch();
    const { engine, overlays } = weatherEngine();

    render(
      <AppearanceProvider>
        <RideApp mapEngine={engine} />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
    const url = new URL(String(fetcher.mock.calls[0]![0]), "http://localhost");
    expect(url.pathname).toBe("/api/weather");

    await waitFor(() => {
      expect(overlays.at(-1)?.clouds).toHaveLength(1);
    });
    expect(overlays.at(-1)?.clouds[0]).toMatchObject({
      level: "rain",
      probability: 88,
    });
    // The advice sentence, and the risk percentage it carried, no longer has a
    // view: the clouds are the whole weather layer.
    expect(screen.queryByText(/Mauvais temps/)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
