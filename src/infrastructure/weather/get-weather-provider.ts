import {
  createRadarProvider,
  createWeatherProvider,
} from "./create-weather-provider";
import type { RadarProvider, WeatherProvider } from "./weather-provider";

export function getWeatherProvider(): WeatherProvider {
  return createWeatherProvider();
}

export function getRadarProvider(): RadarProvider {
  return createRadarProvider();
}
