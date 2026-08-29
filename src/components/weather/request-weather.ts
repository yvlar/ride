import type { Coordinates } from "@/domain/geo/types";
import type { WeatherEscapeAdvice } from "@/domain/weather/escape-direction";
import type { WeatherObservation } from "@/domain/weather/types";

/** FR-043 — what `/api/weather` answers: the field, the imagery, the advice. */
export type WeatherReport = WeatherObservation & {
  advice: WeatherEscapeAdvice;
};

type WeatherSuccessBody = {
  data?: WeatherReport;
};

export const WEATHER_UNAVAILABLE_MESSAGE =
  "Les données météo ne sont pas disponibles.";

export type RequestWeatherOptions = {
  radiusKm?: number;
  signal?: AbortSignal;
};

export async function requestWeather(
  center: Coordinates,
  options: RequestWeatherOptions = {},
): Promise<WeatherReport> {
  const params = new URLSearchParams({
    latitude: String(center.latitude),
    longitude: String(center.longitude),
  });
  if (options.radiusKm) {
    params.set("radiusKm", String(options.radiusKm));
  }

  const response = await fetch(`/api/weather?${params.toString()}`, {
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(WEATHER_UNAVAILABLE_MESSAGE);
  }

  const body = (await response.json()) as WeatherSuccessBody;
  if (!body.data) {
    throw new Error(WEATHER_UNAVAILABLE_MESSAGE);
  }
  return body.data;
}
