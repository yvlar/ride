import { z } from "zod";
import type { Coordinates } from "@/domain/geo/types";
import { clampProbability } from "@/domain/weather/rain-outlook";
import type { WeatherSample } from "@/domain/weather/types";
import type { WeatherProvider } from "./weather-provider";

export const WEATHER_REQUEST_TIMEOUT_MS = 7_000;

/** Point d'entrée public d'Open-Meteo : aucune clé requise. */
export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/";

/**
 * Open-Meteo accepte plusieurs coordonnées par requête. La grille de FR-043 en
 * compte dix-sept : un seul appel suffit, ce qui garde le rafraîchissement
 * « temps réel » compatible avec les quotas gratuits (NFR-006).
 */
const MAX_POINTS_PER_REQUEST = 50;

const currentSchema = z
  .object({
    temperature_2m: z.number().optional(),
    precipitation: z.number().optional(),
    wind_speed_10m: z.number().optional(),
    time: z.string().optional(),
  })
  .optional();

const hourlySchema = z
  .object({
    time: z.array(z.string()).optional(),
    precipitation_probability: z
      .array(z.union([z.number(), z.null()]))
      .optional(),
  })
  .optional();

const locationSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  current: currentSchema,
  hourly: hourlySchema,
});

/** Une seule coordonnée rend un objet; plusieurs rendent un tableau. */
const forecastSchema = z.union([z.array(locationSchema), locationSchema]);

type OpenMeteoLocation = z.infer<typeof locationSchema>;

/**
 * Adaptateur Open-Meteo. Le domaine ne voit que des `WeatherSample` : changer
 * de fournisseur ne touche ni la carte ni le conseil de direction (BR-004).
 */
export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string = OPEN_METEO_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = WEATHER_REQUEST_TIMEOUT_MS,
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
  }

  async forecast(points: readonly Coordinates[]): Promise<WeatherSample[]> {
    if (points.length === 0) {
      return [];
    }

    const samples: WeatherSample[] = [];
    for (let start = 0; start < points.length; start += MAX_POINTS_PER_REQUEST) {
      const batch = points.slice(start, start + MAX_POINTS_PER_REQUEST);
      const payload = await this.request(this.forecastUrl(batch));
      const parsed = forecastSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Réponse météo invalide.");
      }
      const locations = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
      batch.forEach((coordinates, index) => {
        const sample = toSample(locations[index], coordinates);
        if (sample) {
          samples.push(sample);
        }
      });
    }
    return samples;
  }

  private forecastUrl(points: readonly Coordinates[]): URL {
    const url = new URL("forecast", this.baseUrl);
    url.searchParams.set(
      "latitude",
      points.map((point) => point.latitude.toFixed(4)).join(","),
    );
    url.searchParams.set(
      "longitude",
      points.map((point) => point.longitude.toFixed(4)).join(","),
    );
    url.searchParams.set(
      "current",
      "temperature_2m,precipitation,wind_speed_10m",
    );
    // La probabilité n'existe qu'au pas horaire : on ne garde que l'heure en
    // cours, celle qui décide de la direction à prendre maintenant.
    url.searchParams.set("hourly", "precipitation_probability");
    url.searchParams.set("forecast_hours", "1");
    url.searchParams.set("timezone", "UTC");
    return url;
  }

  private async request(url: URL): Promise<unknown> {
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
        response.ok ? "Réponse météo invalide." : `Météo HTTP ${response.status}`,
      );
    }

    if (!response.ok) {
      throw new Error(`Météo HTTP ${response.status}`);
    }

    return payload;
  }
}

/**
 * Les coordonnées demandées sont conservées telles quelles : Open-Meteo répond
 * avec le centre de sa maille, ce qui décalerait les nuages par rapport à la
 * grille d'échantillonnage affichée.
 */
function toSample(
  location: OpenMeteoLocation | undefined,
  coordinates: Coordinates,
): WeatherSample | null {
  if (!location) {
    return null;
  }
  const probability = location.hourly?.precipitation_probability?.[0];
  if (typeof probability !== "number" || !Number.isFinite(probability)) {
    // Sans probabilité, il n'y a pas de nuage à dessiner : mieux vaut un trou
    // dans la nappe qu'une valeur inventée.
    return null;
  }
  return {
    coordinates,
    precipitationProbability: clampProbability(probability),
    precipitationMmPerHour: finiteOrNull(location.current?.precipitation),
    temperatureC: finiteOrNull(location.current?.temperature_2m),
    windKph: finiteOrNull(location.current?.wind_speed_10m),
  };
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseBaseUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("WEATHER_API_BASE_URL doit utiliser HTTP ou HTTPS.");
  }
  return url;
}
