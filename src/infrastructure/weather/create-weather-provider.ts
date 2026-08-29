import { parseEnv, serverProcessEnv } from "@/lib/env";
import { mockWeatherProvider } from "./mock-weather-provider";
import {
  OPEN_METEO_BASE_URL,
  OpenMeteoWeatherProvider,
} from "./open-meteo-weather-provider";
import type { WeatherProvider } from "./weather-provider";

/**
 * FR-043 — contrairement au géocodage, la météo par défaut est le fournisseur
 * réel : une prévision inventée orienterait un pilote vers un orage. Le mock
 * doit être demandé explicitement.
 */
export function createWeatherProvider(
  source?: Record<string, string | undefined>,
): WeatherProvider {
  const env = parseEnv(source ?? serverProcessEnv());

  if (env.WEATHER_PROVIDER === "mock") {
    return mockWeatherProvider;
  }

  return new OpenMeteoWeatherProvider(
    env.WEATHER_API_BASE_URL || OPEN_METEO_BASE_URL,
  );
}
