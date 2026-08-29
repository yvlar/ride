import { z } from "zod";
import type { Coordinates } from "@/domain/geo/types";
import type { WeatherSample } from "@/domain/weather/types";
import type { WeatherProvider } from "./weather-provider";

export const WEATHER_REQUEST_TIMEOUT_MS = 7_000;
export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/";

/** WMO codes 95/96/99 are thunderstorms; nothing else is. */
const THUNDER_WEATHER_CODES = new Set([95, 96, 99]);

const CURRENT_FIELDS = [
  "temperature_2m",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
] as const;

const HOURLY_FIELDS = [
  "precipitation_probability",
  "precipitation",
  "cloud_cover",
  "weather_code",
] as const;

const numeric = z.union([z.number(), z.null()]).optional();

const currentSchema = z
  .object({
    time: z.string().optional(),
    temperature_2m: numeric,
    precipitation: numeric,
    weather_code: numeric,
    cloud_cover: numeric,
    wind_speed_10m: numeric,
  })
  .optional();

const hourlySchema = z
  .object({
    time: z.array(z.string()).optional(),
    precipitation_probability: z.array(numeric).optional(),
    precipitation: z.array(numeric).optional(),
    cloud_cover: z.array(numeric).optional(),
    weather_code: z.array(numeric).optional(),
  })
  .optional();

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  current: currentSchema,
  hourly: hourlySchema,
});

const responseSchema = z.union([locationSchema, z.array(locationSchema)]);

type OpenMeteoLocation = z.infer<typeof locationSchema>;

/**
 * FR-043 — Open-Meteo adapter. The public endpoint needs no key, so the base
 * URL defaults to it and an API key is only sent when one is configured
 * (a self-hosted or commercial instance).
 */
export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string = OPEN_METEO_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiKey?: string,
    private readonly timeoutMs = WEATHER_REQUEST_TIMEOUT_MS,
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
  }

  async sample(points: Coordinates[]): Promise<WeatherSample[]> {
    if (points.length === 0) {
      return [];
    }

    const url = new URL("forecast", this.baseUrl);
    url.searchParams.set(
      "latitude",
      points.map((point) => point.latitude.toFixed(4)).join(","),
    );
    url.searchParams.set(
      "longitude",
      points.map((point) => point.longitude.toFixed(4)).join(","),
    );
    url.searchParams.set("current", CURRENT_FIELDS.join(","));
    url.searchParams.set("hourly", HOURLY_FIELDS.join(","));
    // The probability only exists hourly; one hour of it is all the map needs.
    url.searchParams.set("forecast_hours", "1");
    url.searchParams.set("past_hours", "0");
    url.searchParams.set("timezone", "UTC");
    if (this.apiKey) {
      url.searchParams.set("apikey", this.apiKey);
    }

    const response = await this.fetcher(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        response.ok
          ? "Réponse météo invalide."
          : `Météo HTTP ${response.status}`,
      );
    }

    if (!response.ok) {
      throw new Error(`Météo HTTP ${response.status}`);
    }

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse météo invalide.");
    }

    const locations = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    // Open-Meteo answers in request order; pairing by index keeps the sample
    // on the grid point it was asked for even when it snaps to its own cell.
    return points.map((point, index) =>
      toSample(point, locations[index] ?? locations[0]),
    );
  }
}

function toSample(
  point: Coordinates,
  location: OpenMeteoLocation | undefined,
): WeatherSample {
  const index = hourlyIndex(location);
  const probability = hourlyValue(
    location?.hourly?.precipitation_probability,
    index,
  );
  const hourlyPrecipitation = hourlyValue(location?.hourly?.precipitation, index);
  const hourlyCloud = hourlyValue(location?.hourly?.cloud_cover, index);
  const hourlyCode = hourlyValue(location?.hourly?.weather_code, index);
  const code = firstFinite(location?.current?.weather_code, hourlyCode);

  return {
    coordinates: point,
    precipitationProbability: firstFinite(probability) ?? 0,
    precipitationMmPerHour:
      firstFinite(location?.current?.precipitation, hourlyPrecipitation) ?? 0,
    cloudCover: firstFinite(location?.current?.cloud_cover, hourlyCloud) ?? 0,
    thunder: code !== null && THUNDER_WEATHER_CODES.has(Math.round(code)),
    temperatureC: firstFinite(location?.current?.temperature_2m),
    windSpeedKmh: firstFinite(location?.current?.wind_speed_10m),
  };
}

/**
 * The hour that covers `current.time`. A self-hosted instance that ignores
 * `forecast_hours` returns a full day, and index 0 would then be midnight.
 */
function hourlyIndex(location: OpenMeteoLocation | undefined): number {
  const times = location?.hourly?.time;
  if (!times || times.length === 0) {
    return 0;
  }
  const current = location?.current?.time;
  if (!current) {
    return 0;
  }
  let index = 0;
  for (let candidate = 0; candidate < times.length; candidate += 1) {
    if (times[candidate] <= current) {
      index = candidate;
    }
  }
  return index;
}

function hourlyValue(
  values: (number | null | undefined)[] | undefined,
  index: number,
): number | null | undefined {
  return values?.[index];
}

function firstFinite(
  ...values: (number | null | undefined)[]
): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function parseBaseUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("WEATHER_API_BASE_URL doit utiliser HTTP ou HTTPS.");
  }
  return url;
}
