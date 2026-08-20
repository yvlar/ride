import type { Coordinates, LineString, Position } from "./types";

export const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function haversineKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function initialBearingDeg(from: Coordinates, to: Coordinates): number {
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function offsetCoordinates(
  start: Coordinates,
  bearingDeg: number,
  distanceKm: number,
): Coordinates {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(start.latitude);
  const lon1 = toRadians(start.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    latitude: toDegrees(lat2),
    longitude: ((toDegrees(lon2) + 540) % 360) - 180,
  };
}

export function positionToCoordinates(position: Position): Coordinates {
  return { longitude: position[0], latitude: position[1] };
}

export function coordinatesToPosition(coordinates: Coordinates): Position {
  return [coordinates.longitude, coordinates.latitude];
}

export function lineStringLengthKm(geometry: LineString): number {
  let total = 0;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    total += haversineKm(
      positionToCoordinates(geometry.coordinates[index - 1]),
      positionToCoordinates(geometry.coordinates[index]),
    );
  }
  return total;
}
