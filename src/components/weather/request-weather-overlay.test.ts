import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseWeatherOverlay,
  requestWeatherOverlay,
  WEATHER_UNAVAILABLE_MESSAGE,
} from "./request-weather-overlay";

const overlayBody = {
  data: {
    overlay: {
      center: { latitude: 45.4, longitude: -72.73 },
      radiusKm: 60,
      observedAt: "2026-08-29T14:00:00.000Z",
      samples: [
        {
          coordinates: { latitude: 45.4, longitude: -72.73 },
          precipitationProbability: 65,
          precipitationMmPerHour: 1.1,
          temperatureC: 17,
          windKph: 14,
        },
      ],
    },
  },
};

function stubFetch(body: unknown, status = 200) {
  // Le type générique garde `mock.calls` typé : le test vérifie l'URL appelée.
  const fetcher = vi.fn<(input: URL | RequestInfo) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("appel client de la nappe météo (FR-043)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("interroge /api/weather avec le centre et le rayon", async () => {
    const fetcher = stubFetch(overlayBody);

    const overlay = await requestWeatherOverlay(
      { latitude: 45.4, longitude: -72.73 },
      { radiusKm: 80 },
    );

    const url = new URL(String(fetcher.mock.calls[0]![0]), "http://localhost");
    expect(url.pathname).toBe("/api/weather");
    expect(url.searchParams.get("latitude")).toBe("45.4");
    expect(url.searchParams.get("radiusKm")).toBe("80");
    expect(overlay.samples).toHaveLength(1);
    expect(overlay.samples[0]?.precipitationProbability).toBe(65);
  });

  it("traite une panne HTTP comme une absence de météo", async () => {
    stubFetch({ error: { code: "PROVIDER_ERROR" } }, 503);

    await expect(
      requestWeatherOverlay({ latitude: 45.4, longitude: -72.73 }),
    ).rejects.toThrow(WEATHER_UNAVAILABLE_MESSAGE);
  });

  it("refuse une nappe illisible plutôt que d’en afficher une moitié", async () => {
    stubFetch({ data: { overlay: { center: null, samples: [] } } });

    await expect(
      requestWeatherOverlay({ latitude: 45.4, longitude: -72.73 }),
    ).rejects.toThrow(WEATHER_UNAVAILABLE_MESSAGE);
  });
});

describe("lecture d’une nappe météo", () => {
  it("écarte les relevés inexploitables et garde les autres", () => {
    const overlay = parseWeatherOverlay({
      center: { latitude: 45.4, longitude: -72.73 },
      radiusKm: 60,
      observedAt: "2026-08-29T14:00:00.000Z",
      samples: [
        { coordinates: { latitude: 45.5, longitude: -72.6 } },
        {
          coordinates: { latitude: 45.6, longitude: -72.5 },
          precipitationProbability: "beaucoup",
        },
        {
          coordinates: { latitude: 45.7, longitude: -72.4 },
          precipitationProbability: 130,
        },
      ],
    });

    expect(overlay?.samples).toHaveLength(1);
    expect(overlay?.samples[0]?.precipitationProbability).toBe(100);
    expect(overlay?.samples[0]?.temperatureC).toBeNull();
  });

  it("rejette une nappe sans centre, sans relevé ou d’un autre type", () => {
    expect(parseWeatherOverlay(null)).toBeNull();
    expect(parseWeatherOverlay("nappe")).toBeNull();
    expect(parseWeatherOverlay({ samples: [] })).toBeNull();
    expect(
      parseWeatherOverlay({
        center: { latitude: 45.4, longitude: -72.73 },
        samples: [],
      }),
    ).toBeNull();
  });
});
