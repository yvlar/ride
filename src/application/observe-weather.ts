import type { Coordinates } from "@/domain/geo/types";
import {
  DEFAULT_WEATHER_RADIUS_KM,
  clampRadiusKm,
  weatherSampleGrid,
} from "@/domain/weather/sample-grid";
import type { RadarFrames, WeatherObservation } from "@/domain/weather/types";
import type {
  RadarProvider,
  WeatherProvider,
} from "@/infrastructure/weather/weather-provider";

const NO_RADAR: RadarFrames = { frames: [], attribution: null, maxZoom: null };

export type ObserveWeatherOptions = {
  center: Coordinates;
  radiusKm?: number;
  weather: WeatherProvider;
  radar?: RadarProvider;
  now?: () => Date;
  /** Radar imagery is a bonus; the caller may still want to log its failure. */
  onRadarFailure?: (error: unknown) => void;
};

/**
 * FR-043 — sample the sky around a point and pair it with radar imagery.
 * A radar outage degrades to cloud markers alone: the escape advice comes from
 * the forecast field, so it must never depend on the pictures.
 */
export async function observeWeather({
  center,
  radiusKm = DEFAULT_WEATHER_RADIUS_KM,
  weather,
  radar,
  now = () => new Date(),
  onRadarFailure,
}: ObserveWeatherOptions): Promise<WeatherObservation> {
  const radius = clampRadiusKm(radiusKm);
  const points = weatherSampleGrid(center, radius);

  const [samples, frames] = await Promise.all([
    weather.sample(points),
    radar
      ? radar.frames().catch((error: unknown) => {
          onRadarFailure?.(error);
          return NO_RADAR;
        })
      : Promise.resolve(NO_RADAR),
  ]);

  return {
    field: {
      center,
      radiusKm: radius,
      samples,
      observedAtIso: now().toISOString(),
    },
    radar: frames,
  };
}
