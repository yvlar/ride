import { parseEnv, serverProcessEnv } from "@/lib/env";
import { mockRadarProvider, mockWeatherProvider } from "./mock-weather-provider";
import {
  OPEN_METEO_BASE_URL,
  OpenMeteoWeatherProvider,
} from "./open-meteo-weather-provider";
import {
  GEOMET_BASE_URL,
  GeoMetRadarProvider,
} from "./geomet-radar-provider";
import {
  RAINVIEWER_BASE_URL,
  RainViewerRadarProvider,
} from "./rainviewer-radar-provider";
import type { RadarProvider, WeatherProvider } from "./weather-provider";

/**
 * FR-043 — Open-Meteo needs no key, so the default is the real sky rather than
 * a synthetic one. `WEATHER_PROVIDER=mock` keeps the map working offline.
 */
export function createWeatherProvider(
  source?: Record<string, string | undefined>,
): WeatherProvider {
  const env = parseEnv(source ?? serverProcessEnv());

  if (env.WEATHER_PROVIDER === "mock") {
    return mockWeatherProvider;
  }

  if (env.WEATHER_PROVIDER === "open-meteo") {
    return new OpenMeteoWeatherProvider(
      env.WEATHER_API_BASE_URL ?? OPEN_METEO_BASE_URL,
      fetch,
      env.WEATHER_API_KEY,
    );
  }

  throw new Error(
    `Le fournisseur météo « ${env.WEATHER_PROVIDER} » n’est pas branché. Utilisez WEATHER_PROVIDER=open-meteo ou mock.`,
  );
}

/**
 * FR-043 — RainViewer is keyless too and covers the whole world, so it stays
 * the default. `RADAR_PROVIDER=geomet` trades that reach for the Meteorological
 * Service of Canada's 1 km North American composite: sharper at riding zoom,
 * observations only. `mock` drops imagery entirely.
 */
export function createRadarProvider(
  source?: Record<string, string | undefined>,
): RadarProvider {
  const env = parseEnv(source ?? serverProcessEnv());

  if (env.RADAR_PROVIDER === "mock") {
    return mockRadarProvider;
  }

  if (env.RADAR_PROVIDER === "geomet") {
    return new GeoMetRadarProvider(
      env.RADAR_API_BASE_URL ?? GEOMET_BASE_URL,
      fetch,
    );
  }

  if (env.RADAR_PROVIDER === "rainviewer") {
    return new RainViewerRadarProvider(
      env.RADAR_API_BASE_URL ?? RAINVIEWER_BASE_URL,
      fetch,
      env.RADAR_API_KEY,
    );
  }

  throw new Error(
    `Le fournisseur radar « ${env.RADAR_PROVIDER} » n’est pas branché. Utilisez RADAR_PROVIDER=rainviewer, geomet ou mock.`,
  );
}
