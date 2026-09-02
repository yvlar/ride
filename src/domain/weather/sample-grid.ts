import { offsetCoordinates } from "@/domain/geo/distance";
import type { BoundingBox, Coordinates } from "@/domain/geo/types";

/**
 * FR-043 — how far around the rider the sky is sampled. Roughly half an hour
 * of riding: far enough to see the front coming, close enough that the advice
 * is still about this ride.
 */
export const DEFAULT_WEATHER_RADIUS_KM = 45;
export const MIN_WEATHER_RADIUS_KM = 5;
export const MAX_WEATHER_RADIUS_KM = 200;

/** Three rings plus the rider: 49 points, still one provider call. */
export const WEATHER_SAMPLE_RINGS = 3;

/**
 * Points on ring `n`. A fixed count per ring would space the outer ring three
 * times wider than the inner one — 35 km between neighbours at 45 km, wide
 * enough to miss a whole cell. Scaling the count with the radius keeps the
 * spacing constant all the way out, so the field covers the ground the radar
 * imagery draws instead of dotting it.
 */
const POINTS_PER_RING_STEP = 8;

/**
 * FR-043 — the rider first, then rings outward, each denser than the last.
 * Keeping the centre at index 0 lets every consumer read the local sky without
 * a search, and every ring starts due north.
 */
export function weatherSampleGrid(
  center: Coordinates,
  radiusKm: number = DEFAULT_WEATHER_RADIUS_KM,
  rings: number = WEATHER_SAMPLE_RINGS,
): Coordinates[] {
  const radius = clampRadiusKm(radiusKm);
  const ringCount = Math.max(1, Math.floor(rings));
  const points: Coordinates[] = [center];

  for (let ring = 1; ring <= ringCount; ring += 1) {
    const distanceKm = (radius * ring) / ringCount;
    const count = POINTS_PER_RING_STEP * ring;
    for (let step = 0; step < count; step += 1) {
      points.push(offsetCoordinates(center, (360 * step) / count, distanceKm));
    }
  }

  return points;
}

/** How many samples a grid of `rings` rings asks the provider for. */
export function weatherSampleCount(
  rings: number = WEATHER_SAMPLE_RINGS,
): number {
  const ringCount = Math.max(1, Math.floor(rings));
  let total = 1;
  for (let ring = 1; ring <= ringCount; ring += 1) {
    total += POINTS_PER_RING_STEP * ring;
  }
  return total;
}

export function clampRadiusKm(radiusKm: number): number {
  if (!Number.isFinite(radiusKm)) {
    return DEFAULT_WEATHER_RADIUS_KM;
  }
  return Math.min(
    Math.max(radiusKm, MIN_WEATHER_RADIUS_KM),
    MAX_WEATHER_RADIUS_KM,
  );
}

/** Extent covered by a sampled field, for framing or fetching radar tiles. */
export function weatherFieldBounds(
  center: Coordinates,
  radiusKm: number = DEFAULT_WEATHER_RADIUS_KM,
): BoundingBox {
  const radius = clampRadiusKm(radiusKm);
  const north = offsetCoordinates(center, 0, radius);
  const east = offsetCoordinates(center, 90, radius);
  const south = offsetCoordinates(center, 180, radius);
  const west = offsetCoordinates(center, 270, radius);
  return {
    north: north.latitude,
    east: east.longitude,
    south: south.latitude,
    west: west.longitude,
  };
}

/**
 * FR-043 — coarse cell a position falls into. Refetching the whole field for
 * every GPS fix would hammer the provider and redraw the clouds constantly;
 * anchoring to a ~11 km grid refreshes only once the rider has actually
 * moved. The exact position still drives the advice, which is a pure read of
 * the field.
 */
export const WEATHER_ANCHOR_STEP_DEG = 0.1;

export function weatherAnchor(
  center: Coordinates,
  stepDeg: number = WEATHER_ANCHOR_STEP_DEG,
): Coordinates {
  return {
    latitude: roundToWeatherCell(center.latitude, stepDeg),
    longitude: roundToWeatherCell(center.longitude, stepDeg),
  };
}

/**
 * One axis of the anchor. Exposed on its own because a caller that memoises on
 * the anchor needs primitive values: rebuilding a `{ latitude, longitude }`
 * object on every GPS fix would look like a move to anything watching it.
 */
export function roundToWeatherCell(
  value: number,
  stepDeg: number = WEATHER_ANCHOR_STEP_DEG,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const step = stepDeg > 0 ? stepDeg : WEATHER_ANCHOR_STEP_DEG;
  // Rounding through the step count keeps 0.1° cells free of binary drift.
  return Number((Math.round(value / step) * step).toFixed(6));
}
