import { describe, expect, it } from "vitest";
import {
  createRadarProvider,
  createWeatherProvider,
} from "./create-weather-provider";
import { GeoMetRadarProvider } from "./geomet-radar-provider";
import { mockRadarProvider, mockWeatherProvider } from "./mock-weather-provider";
import { OpenMeteoWeatherProvider } from "./open-meteo-weather-provider";
import { RainViewerRadarProvider } from "./rainviewer-radar-provider";

describe("createWeatherProvider (FR-043)", () => {
  it("defaults to Open-Meteo, which needs no key", () => {
    expect(createWeatherProvider({})).toBeInstanceOf(OpenMeteoWeatherProvider);
  });

  it("returns the offline provider on request", () => {
    expect(createWeatherProvider({ WEATHER_PROVIDER: "mock" })).toBe(
      mockWeatherProvider,
    );
  });

  it("accepts a self-hosted base URL", () => {
    expect(
      createWeatherProvider({
        WEATHER_API_BASE_URL: "https://meteo.example.test/v1",
      }),
    ).toBeInstanceOf(OpenMeteoWeatherProvider);
  });

  it("rejects an unknown provider by name", () => {
    expect(() =>
      createWeatherProvider({ WEATHER_PROVIDER: "unknown" }),
    ).toThrow();
  });
});

describe("createRadarProvider (FR-043)", () => {
  it("defaults to RainViewer, which needs no key", () => {
    expect(createRadarProvider({})).toBeInstanceOf(RainViewerRadarProvider);
  });

  it("returns the offline provider on request", () => {
    expect(createRadarProvider({ RADAR_PROVIDER: "mock" })).toBe(
      mockRadarProvider,
    );
  });

  it("switches to the Canadian service on request (FR-043)", () => {
    expect(createRadarProvider({ RADAR_PROVIDER: "geomet" })).toBeInstanceOf(
      GeoMetRadarProvider,
    );
  });

  it("points the Canadian service at a configured host", () => {
    expect(
      createRadarProvider({
        RADAR_PROVIDER: "geomet",
        RADAR_API_BASE_URL: "https://geomet.example.test/wms",
      }),
    ).toBeInstanceOf(GeoMetRadarProvider);
  });

  it("rejects an unknown provider by name", () => {
    expect(() => createRadarProvider({ RADAR_PROVIDER: "unknown" })).toThrow();
  });
});
