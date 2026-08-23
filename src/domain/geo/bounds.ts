import type { BoundingBox, Coordinates, LineString } from "./types";

/** Minimum span so a single point still frames as an area (FR-013). */
export const MIN_BOUNDING_SPAN_DEG = 0.01;

export function boundingBox(
  geometry: LineString,
  extra: Coordinates[] = [],
): BoundingBox | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const position of geometry.coordinates) {
    west = Math.min(west, position[0]);
    east = Math.max(east, position[0]);
    south = Math.min(south, position[1]);
    north = Math.max(north, position[1]);
    found = true;
  }

  for (const point of extra) {
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
    found = true;
  }

  if (!found) {
    return null;
  }

  return ensureMinimumSpan({ west, south, east, north });
}

export function ensureMinimumSpan(
  box: BoundingBox,
  minSpanDeg = MIN_BOUNDING_SPAN_DEG,
): BoundingBox {
  let { west, south, east, north } = box;

  if (east - west < minSpanDeg) {
    const mid = (east + west) / 2;
    west = mid - minSpanDeg / 2;
    east = mid + minSpanDeg / 2;
  }

  if (north - south < minSpanDeg) {
    const mid = (north + south) / 2;
    south = mid - minSpanDeg / 2;
    north = mid + minSpanDeg / 2;
  }

  return { west, south, east, north };
}
