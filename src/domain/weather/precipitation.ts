import type { PrecipitationLevel, WeatherSample } from "./types";

/** Above this chance of precipitation the sky is no longer merely grey. */
const SHOWERS_PROBABILITY = 35;
const RAIN_PROBABILITY = 60;

/** mm/h thresholds. Environment Canada calls 7.6 mm/h "heavy rain". */
const SHOWERS_MM_PER_HOUR = 0.2;
const RAIN_MM_PER_HOUR = 2;
const STORM_MM_PER_HOUR = 7.6;

const CLOUDY_COVER = 45;

/**
 * FR-043 — classify one sample. Intensity and probability both count: a 90 %
 * chance of a 0.1 mm drizzle is not the same ride as a 40 % chance of a
 * downpour, and the rider needs to tell them apart at a glance.
 */
export function precipitationLevel(sample: WeatherSample): PrecipitationLevel {
  const probability = clampPercent(sample.precipitationProbability);
  const intensity = Math.max(0, sample.precipitationMmPerHour);

  if (sample.thunder || intensity >= STORM_MM_PER_HOUR) {
    return "storm";
  }
  if (intensity >= RAIN_MM_PER_HOUR || probability >= RAIN_PROBABILITY) {
    return "rain";
  }
  if (intensity >= SHOWERS_MM_PER_HOUR || probability >= SHOWERS_PROBABILITY) {
    return "showers";
  }
  if (clampPercent(sample.cloudCover) >= CLOUDY_COVER) {
    return "cloudy";
  }
  return "clear";
}

/**
 * FR-043 — a single 0–1 number used to compare one part of the sky with
 * another. Probability dominates, intensity raises the stakes, and thunder
 * pins the sample near the top whatever the millimetres say.
 */
export function precipitationRisk(sample: WeatherSample): number {
  const probability = clampPercent(sample.precipitationProbability) / 100;
  const intensity = Math.min(Math.max(0, sample.precipitationMmPerHour), 10) / 10;
  const risk = probability * 0.7 + intensity * 0.3;
  if (sample.thunder) {
    return Math.max(risk, 0.9);
  }
  return clampUnit(risk);
}

const LEVEL_LABELS: Record<PrecipitationLevel, string> = {
  clear: "Ciel dégagé",
  cloudy: "Nuageux",
  showers: "Averses possibles",
  rain: "Pluie",
  storm: "Orage",
};

export function precipitationLevelLabel(level: PrecipitationLevel): string {
  return LEVEL_LABELS[level];
}

/** Rain is worth avoiding from `showers` up; below that it is only a sky. */
export function isWetLevel(level: PrecipitationLevel): boolean {
  return level === "showers" || level === "rain" || level === "storm";
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}
