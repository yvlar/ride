import type { Coordinates } from "@/domain/geo/types";

/**
 * FR-043 — how the sky reads at one point, from the driest to the worst.
 * The order is meaningful: a higher index is a worse sky for a motorcycle.
 */
export const PRECIPITATION_LEVELS = [
  "clear",
  "cloudy",
  "showers",
  "rain",
  "storm",
] as const;

export type PrecipitationLevel = (typeof PRECIPITATION_LEVELS)[number];

/** FR-043 — one forecast point of the field sampled around the rider. */
export type WeatherSample = {
  coordinates: Coordinates;
  /** Chance of precipitation, 0–100. */
  precipitationProbability: number;
  /** Precipitation intensity in mm/h. */
  precipitationMmPerHour: number;
  /** Cloud cover, 0–100. */
  cloudCover: number;
  /** Thunderstorm reported by the provider, when it says so. */
  thunder: boolean;
  temperatureC: number | null;
  windSpeedKmh: number | null;
};

/** FR-043 — the sampled sky around a point, at one instant. */
export type WeatherField = {
  center: Coordinates;
  /** Half-width of the sampled area, in kilometres. */
  radiusKm: number;
  samples: WeatherSample[];
  /** Provider timestamp of the observation, ISO-8601. */
  observedAtIso: string;
};

/**
 * FR-043 — one radar image in time. `past` frames are observations, `forecast`
 * frames are the provider's nowcast: they are what tells the rider where the
 * cell is heading, not only where it sits now.
 */
export type RadarFrame = {
  id: string;
  timeIso: string;
  kind: "past" | "forecast";
  /** MapLibre raster template, with the {z}/{x}/{y} placeholders. */
  tileUrlTemplate: string;
};

export type RadarFrames = {
  frames: RadarFrame[];
  attribution: string | null;
  /**
   * Deepest zoom the provider actually serves. Past it the map has to upscale
   * the last real tile: asking for more returns a placeholder image, not
   * imagery. Null when the provider serves every zoom.
   */
  maxZoom: number | null;
};

/** FR-043 — everything the map needs for one weather refresh. */
export type WeatherObservation = {
  field: WeatherField;
  radar: RadarFrames;
};
