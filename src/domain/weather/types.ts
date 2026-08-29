import type { BoundingBox, Coordinates } from "@/domain/geo/types";

/**
 * FR-043 — un relevé météo ponctuel, indépendant du fournisseur. Le domaine ne
 * connaît ni Open-Meteo ni MapLibre : l'adaptateur traduit vers ce type et le
 * moteur de carte le consomme (BR-004).
 */
export type WeatherSample = {
  coordinates: Coordinates;
  /** Probabilité de précipitations pour l'heure en cours, de 0 à 100. */
  precipitationProbability: number;
  /** Intensité observée en mm/h, quand le fournisseur la publie. */
  precipitationMmPerHour: number | null;
  temperatureC: number | null;
  windKph: number | null;
};

/** FR-043 — la nappe météo affichée autour du pilote à un instant donné. */
export type WeatherOverlay = {
  center: Coordinates;
  radiusKm: number;
  samples: WeatherSample[];
  /** Horodatage ISO du relevé, pour afficher la fraîcheur de la donnée. */
  observedAt: string;
};

export const WEATHER_ATTRIBUTION = "Données météo Open-Meteo";

export function weatherOverlayBounds(
  overlay: WeatherOverlay,
): BoundingBox | null {
  if (overlay.samples.length === 0) {
    return null;
  }
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const sample of overlay.samples) {
    west = Math.min(west, sample.coordinates.longitude);
    east = Math.max(east, sample.coordinates.longitude);
    south = Math.min(south, sample.coordinates.latitude);
    north = Math.max(north, sample.coordinates.latitude);
  }
  return { west, south, east, north };
}
