import { haversineKm, offsetCoordinates, positionToCoordinates } from "./distance";
import type { Coordinates, LineString } from "./types";

export function firstCoordinates(geometry: LineString): Coordinates | null {
  const first = geometry.coordinates[0];
  return first ? positionToCoordinates(first) : null;
}

export function lastCoordinates(geometry: LineString): Coordinates | null {
  const last = geometry.coordinates[geometry.coordinates.length - 1];
  return last ? positionToCoordinates(last) : null;
}

export function centroid(geometry: LineString): Coordinates | null {
  if (geometry.coordinates.length === 0) {
    return null;
  }

  let latitude = 0;
  let longitude = 0;
  for (const position of geometry.coordinates) {
    longitude += position[0];
    latitude += position[1];
  }

  return {
    latitude: latitude / geometry.coordinates.length,
    longitude: longitude / geometry.coordinates.length,
  };
}

/**
 * Coefficient of variation of distances from the centroid.
 * A perfect circle approaches 0; a road network path is typically higher.
 */
export function radiusCoefficientOfVariation(geometry: LineString): number {
  const center = centroid(geometry);
  if (!center || geometry.coordinates.length < 3) {
    return Number.POSITIVE_INFINITY;
  }

  const radii = geometry.coordinates.map((position) =>
    haversineKm(center, positionToCoordinates(position)),
  );
  const mean = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  if (mean === 0) {
    return 0;
  }

  const variance =
    radii.reduce((sum, radius) => sum + (radius - mean) ** 2, 0) / radii.length;
  return Math.sqrt(variance) / mean;
}

export function createCircleLineString(
  center: Coordinates,
  radiusKm: number,
  pointCount: number,
  startBearingDeg = 0,
): LineString {
  const coordinates: LineString["coordinates"] = [];
  for (let index = 0; index <= pointCount; index += 1) {
    const bearing = startBearingDeg + (360 * index) / pointCount;
    const point = offsetCoordinates(center, bearing, radiusKm);
    coordinates.push([point.longitude, point.latitude]);
  }
  return { type: "LineString", coordinates };
}
