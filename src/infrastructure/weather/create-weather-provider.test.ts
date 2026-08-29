import { describe, expect, it } from "vitest";
import { createWeatherProvider } from "./create-weather-provider";
import { mockWeatherProvider } from "./mock-weather-provider";
import { OpenMeteoWeatherProvider } from "./open-meteo-weather-provider";

describe("choix du fournisseur météo (FR-043)", () => {
  it("utilise Open-Meteo par défaut : une météo inventée est pire que pas de météo", () => {
    expect(createWeatherProvider({})).toBeInstanceOf(OpenMeteoWeatherProvider);
  });

  it("ne sert le mock que sur demande explicite", () => {
    expect(createWeatherProvider({ WEATHER_PROVIDER: "mock" })).toBe(
      mockWeatherProvider,
    );
  });

  it("accepte une instance auto-hébergée", () => {
    expect(
      createWeatherProvider({
        WEATHER_PROVIDER: "open-meteo",
        WEATHER_API_BASE_URL: "https://meteo.interne/v1",
      }),
    ).toBeInstanceOf(OpenMeteoWeatherProvider);
  });

  it("rejette un fournisseur inconnu", () => {
    expect(() => createWeatherProvider({ WEATHER_PROVIDER: "magie" })).toThrow();
  });
});

describe("nappe météo de développement", () => {
  it("reste déterministe et bornée", async () => {
    const points = [
      { latitude: 45.4, longitude: -72.73 },
      { latitude: 46.1, longitude: -71.2 },
    ];

    const first = await mockWeatherProvider.forecast(points);
    const second = await mockWeatherProvider.forecast(points);

    expect(first).toEqual(second);
    for (const sample of first) {
      expect(sample.precipitationProbability).toBeGreaterThanOrEqual(0);
      expect(sample.precipitationProbability).toBeLessThanOrEqual(100);
    }
  });
});
