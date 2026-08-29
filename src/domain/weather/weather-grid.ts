import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";

/**
 * FR-043 — rayon interrogé autour du pilote. 60 km couvre environ une heure de
 * route : au-delà, la prévision horaire ne dit plus rien d'utile sur la
 * direction à prendre maintenant.
 */
export const WEATHER_DEFAULT_RADIUS_KM = 60;
export const WEATHER_MIN_RADIUS_KM = 10;
export const WEATHER_MAX_RADIUS_KM = 200;

/** Relèvements des huit secteurs de la rose des vents, en degrés. */
export const WEATHER_RING_BEARINGS_DEG = [
  0, 45, 90, 135, 180, 225, 270, 315,
] as const;

/** Fractions du rayon sur lesquelles les couronnes sont posées. */
const RING_FRACTIONS = [0.5, 1] as const;

/**
 * Grille d'échantillonnage : le point du pilote, puis deux couronnes de huit
 * points. Dix-sept relevés suffisent à dire de quel côté vient la pluie et
 * tiennent dans une seule requête au fournisseur (NFR-006).
 */
export function weatherSamplePoints(
  center: Coordinates,
  radiusKm: number = WEATHER_DEFAULT_RADIUS_KM,
): Coordinates[] {
  const radius = clampRadiusKm(radiusKm);
  const points: Coordinates[] = [center];
  for (const fraction of RING_FRACTIONS) {
    for (const bearingDeg of WEATHER_RING_BEARINGS_DEG) {
      points.push(offsetCoordinates(center, bearingDeg, radius * fraction));
    }
  }
  return points;
}

export function clampRadiusKm(radiusKm: number): number {
  if (!Number.isFinite(radiusKm)) {
    return WEATHER_DEFAULT_RADIUS_KM;
  }
  return Math.min(
    WEATHER_MAX_RADIUS_KM,
    Math.max(WEATHER_MIN_RADIUS_KM, radiusKm),
  );
}
