import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WEATHER_RADIUS_KM } from "@/domain/weather/sample-grid";
import type { WeatherSample } from "@/domain/weather/types";
import type {
  RadarProvider,
  WeatherProvider,
} from "@/infrastructure/weather/weather-provider";
import { observeWeather } from "./observe-weather";

const center = { latitude: 45.5, longitude: -72.75 };

const weather: WeatherProvider = {
  sample: async (points) =>
    points.map<WeatherSample>((coordinates) => ({
      coordinates,
      precipitationProbability: 10,
      precipitationMmPerHour: 0,
      cloudCover: 30,
      thunder: false,
      temperatureC: 20,
      windSpeedKmh: 10,
    })),
};

const radar: RadarProvider = {
  frames: async () => ({
    frames: [
      {
        id: "past-1",
        timeIso: "2026-08-29T15:00:00.000Z",
        kind: "past",
        tileUrlTemplate: "https://tiles.test/{z}/{x}/{y}.png",
      },
    ],
    attribution: "Images radar © Test",
  }),
};

describe("observeWeather (FR-043)", () => {
  it("samples the grid around the centre and dates the field", async () => {
    const observation = await observeWeather({
      center,
      weather,
      radar,
      now: () => new Date("2026-08-29T15:04:00.000Z"),
    });

    expect(observation.field.center).toEqual(center);
    expect(observation.field.radiusKm).toBe(DEFAULT_WEATHER_RADIUS_KM);
    expect(observation.field.samples).toHaveLength(17);
    expect(observation.field.observedAtIso).toBe("2026-08-29T15:04:00.000Z");
    expect(observation.radar.frames).toHaveLength(1);
  });

  it("clamps an absurd radius before calling the provider", async () => {
    const sample = vi.fn(weather.sample);

    const observation = await observeWeather({
      center,
      radiusKm: 100_000,
      weather: { sample },
    });

    expect(observation.field.radiusKm).toBe(200);
    expect(sample).toHaveBeenCalledTimes(1);
  });

  it("keeps the clouds when the radar imagery fails", async () => {
    const onRadarFailure = vi.fn();

    const observation = await observeWeather({
      center,
      weather,
      radar: {
        frames: async () => {
          throw new Error("Radar HTTP 503");
        },
      },
      onRadarFailure,
    });

    expect(observation.field.samples).toHaveLength(17);
    expect(observation.radar).toEqual({ frames: [], attribution: null });
    expect(onRadarFailure).toHaveBeenCalledOnce();
  });

  it("answers without imagery when no radar provider is configured", async () => {
    const observation = await observeWeather({ center, weather });

    expect(observation.radar).toEqual({ frames: [], attribution: null });
  });

  it("propagates a forecast failure: there is nothing to draw", async () => {
    await expect(
      observeWeather({
        center,
        weather: {
          sample: async () => {
            throw new Error("Météo HTTP 503");
          },
        },
        radar,
      }),
    ).rejects.toThrow("Météo HTTP 503");
  });
});
