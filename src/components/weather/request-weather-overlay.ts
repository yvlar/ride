import type { Coordinates } from "@/domain/geo/types";
import { clampProbability } from "@/domain/weather/rain-outlook";
import type { WeatherOverlay, WeatherSample } from "@/domain/weather/types";
import { WEATHER_DEFAULT_RADIUS_KM } from "@/domain/weather/weather-grid";

export const WEATHER_UNAVAILABLE_MESSAGE =
  "Météo indisponible pour le moment. Le trajet reste affiché.";

type WeatherResponseBody = {
  data?: { overlay?: unknown };
};

export type RequestWeatherOverlay = (
  center: Coordinates,
  options?: { radiusKm?: number; signal?: AbortSignal },
) => Promise<WeatherOverlay>;

/**
 * FR-043 — appel client de la nappe météo. Une réponse illisible est une
 * absence de météo, jamais une nappe partielle : le pilote doit pouvoir se fier
 * aux nuages affichés.
 */
export const requestWeatherOverlay: RequestWeatherOverlay = async (
  center,
  options = {},
) => {
  const params = new URLSearchParams({
    latitude: String(center.latitude),
    longitude: String(center.longitude),
    radiusKm: String(options.radiusKm ?? WEATHER_DEFAULT_RADIUS_KM),
  });

  const response = await fetch(`/api/weather?${params.toString()}`, {
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(WEATHER_UNAVAILABLE_MESSAGE);
  }

  const body = (await response.json()) as WeatherResponseBody;
  const overlay = parseWeatherOverlay(body.data?.overlay);
  if (!overlay) {
    throw new Error(WEATHER_UNAVAILABLE_MESSAGE);
  }
  return overlay;
};

export function parseWeatherOverlay(value: unknown): WeatherOverlay | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<WeatherOverlay>;
  const center = parseCoordinates(candidate.center);
  if (!center || !Array.isArray(candidate.samples)) {
    return null;
  }
  const samples = candidate.samples.flatMap((sample) => {
    const parsed = parseSample(sample);
    return parsed ? [parsed] : [];
  });
  if (samples.length === 0) {
    return null;
  }
  return {
    center,
    radiusKm:
      typeof candidate.radiusKm === "number" &&
      Number.isFinite(candidate.radiusKm)
        ? candidate.radiusKm
        : WEATHER_DEFAULT_RADIUS_KM,
    samples,
    observedAt:
      typeof candidate.observedAt === "string" && candidate.observedAt !== ""
        ? candidate.observedAt
        : new Date().toISOString(),
  };
}

function parseSample(value: unknown): WeatherSample | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<WeatherSample>;
  const coordinates = parseCoordinates(candidate.coordinates);
  if (
    !coordinates ||
    typeof candidate.precipitationProbability !== "number" ||
    !Number.isFinite(candidate.precipitationProbability)
  ) {
    return null;
  }
  return {
    coordinates,
    precipitationProbability: clampProbability(candidate.precipitationProbability),
    precipitationMmPerHour: finiteOrNull(candidate.precipitationMmPerHour),
    temperatureC: finiteOrNull(candidate.temperatureC),
    windKph: finiteOrNull(candidate.windKph),
  };
}

function parseCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<Coordinates>;
  if (
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number" ||
    !Number.isFinite(candidate.latitude) ||
    !Number.isFinite(candidate.longitude)
  ) {
    return null;
  }
  return { latitude: candidate.latitude, longitude: candidate.longitude };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
