import { describe, expect, it, vi } from "vitest";
import {
  OPEN_METEO_BASE_URL,
  OpenMeteoWeatherProvider,
} from "./open-meteo-weather-provider";

const points = [
  { latitude: 45.5, longitude: -72.75 },
  { latitude: 45.9, longitude: -72.75 },
];

function location(overrides: Record<string, unknown> = {}) {
  return {
    latitude: 45.5,
    longitude: -72.75,
    current: {
      time: "2026-08-29T15:00",
      temperature_2m: 21.4,
      precipitation: 0.4,
      weather_code: 61,
      cloud_cover: 78,
      wind_speed_10m: 17,
    },
    hourly: {
      time: ["2026-08-29T15:00"],
      precipitation_probability: [65],
      precipitation: [0.4],
      cloud_cover: [78],
      weather_code: [61],
    },
    ...overrides,
  };
}

function jsonFetch(payload: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("OpenMeteoWeatherProvider (FR-043)", () => {
  it("asks for every point in a single request", async () => {
    const fetcher = jsonFetch([location(), location()]);
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      fetcher as unknown as typeof fetch,
    );

    await provider.sample(points);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("45.5000,45.9000");
    expect(url.searchParams.get("longitude")).toBe("-72.7500,-72.7500");
    expect(url.searchParams.get("forecast_hours")).toBe("1");
    expect(url.searchParams.get("hourly")).toContain(
      "precipitation_probability",
    );
  });

  it("maps a location onto the point it was asked for", async () => {
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      jsonFetch([location(), location()]) as unknown as typeof fetch,
    );

    const samples = await provider.sample(points);

    expect(samples).toHaveLength(2);
    expect(samples[0]!.coordinates).toEqual(points[0]);
    expect(samples[1]!.coordinates).toEqual(points[1]);
    expect(samples[0]).toMatchObject({
      precipitationProbability: 65,
      precipitationMmPerHour: 0.4,
      cloudCover: 78,
      thunder: false,
      temperatureC: 21.4,
      windSpeedKmh: 17,
    });
  });

  it("accepts the single-object shape returned for one point", async () => {
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      jsonFetch(location()) as unknown as typeof fetch,
    );

    const samples = await provider.sample([points[0]!]);

    expect(samples).toHaveLength(1);
    expect(samples[0]!.precipitationProbability).toBe(65);
  });

  it("flags a thunderstorm from the WMO weather code", async () => {
    const stormy = location({
      current: { ...location().current, weather_code: 95 },
    });
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      jsonFetch([stormy]) as unknown as typeof fetch,
    );

    const samples = await provider.sample([points[0]!]);

    expect(samples[0]!.thunder).toBe(true);
  });

  it("reads the hour covering now when a whole day comes back", async () => {
    const wholeDay = location({
      hourly: {
        time: [
          "2026-08-29T00:00",
          "2026-08-29T15:00",
          "2026-08-29T23:00",
        ],
        precipitation_probability: [5, 65, 90],
        precipitation: [0, 0.4, 3],
        cloud_cover: [10, 78, 95],
        weather_code: [0, 61, 65],
      },
    });
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      jsonFetch([wholeDay]) as unknown as typeof fetch,
    );

    const samples = await provider.sample([points[0]!]);

    expect(samples[0]!.precipitationProbability).toBe(65);
  });

  it("treats missing values as a dry, unknown sky rather than failing", async () => {
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      jsonFetch([
        { latitude: 45.5, longitude: -72.75 },
      ]) as unknown as typeof fetch,
    );

    const samples = await provider.sample([points[0]!]);

    expect(samples[0]).toMatchObject({
      precipitationProbability: 0,
      precipitationMmPerHour: 0,
      cloudCover: 0,
      thunder: false,
      temperatureC: null,
      windSpeedKmh: null,
    });
  });

  it("never calls the provider for an empty grid", async () => {
    const fetcher = jsonFetch([]);
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      fetcher as unknown as typeof fetch,
    );

    await expect(provider.sample([])).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports an HTTP failure in French", async () => {
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      jsonFetch({ error: true }, 503) as unknown as typeof fetch,
    );

    await expect(provider.sample(points)).rejects.toThrow("Météo HTTP 503");
  });

  it("rejects a payload that is not a forecast", async () => {
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      jsonFetch({ unexpected: true }) as unknown as typeof fetch,
    );

    await expect(provider.sample(points)).rejects.toThrow(
      "Réponse météo invalide.",
    );
  });

  it("refuses a base URL that is not HTTP", () => {
    expect(() => new OpenMeteoWeatherProvider("ftp://example.test")).toThrow(
      "WEATHER_API_BASE_URL",
    );
  });

  it("sends a key only when one is configured", async () => {
    const fetcher = jsonFetch([location()]);
    const provider = new OpenMeteoWeatherProvider(
      OPEN_METEO_BASE_URL,
      fetcher as unknown as typeof fetch,
      "test-weather-key",
    );

    await provider.sample([points[0]!]);

    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get("apikey")).toBe("test-weather-key");
  });
});
