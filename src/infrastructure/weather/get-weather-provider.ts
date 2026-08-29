import { createWeatherProvider } from "./create-weather-provider";
import type { WeatherProvider } from "./weather-provider";

export function getWeatherProvider(): WeatherProvider {
  return createWeatherProvider();
}
