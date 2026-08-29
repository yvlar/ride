import { clampProbability } from "@/domain/weather/rain-outlook";
import type { Coordinates } from "@/domain/geo/types";
import type { WeatherSample } from "@/domain/weather/types";
import type { WeatherProvider } from "./weather-provider";

/**
 * Nappe météo déterministe pour le développement et les tests. Elle n'est
 * jamais servie en production : il faut `WEATHER_PROVIDER=mock` pour l'obtenir,
 * et l'interface affiche alors la même mention de source que le fournisseur
 * réel. Le champ est continu, avec un front de pluie : la logique de direction
 * de FR-043 est donc exercée sans réseau.
 */
export const mockWeatherProvider: WeatherProvider = {
  async forecast(points: readonly Coordinates[]): Promise<WeatherSample[]> {
    return points.map((coordinates) => ({
      coordinates,
      precipitationProbability: mockRainProbability(coordinates),
      precipitationMmPerHour:
        Math.round(mockRainProbability(coordinates) * 0.04 * 10) / 10,
      temperatureC:
        Math.round((14 + Math.sin(coordinates.longitude * 1.1) * 6) * 10) / 10,
      windKph: Math.round(8 + Math.abs(Math.cos(coordinates.latitude)) * 14),
    }));
  },
};

export function mockRainProbability(coordinates: Coordinates): number {
  const front =
    Math.sin(coordinates.latitude * 2.2) + Math.cos(coordinates.longitude * 1.7);
  return clampProbability(Math.round(((front + 2) / 4) * 100));
}
