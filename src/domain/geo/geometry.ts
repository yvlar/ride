import {
  haversineKm,
  initialBearingDeg,
  lineStringLengthKm,
  offsetCoordinates,
  positionToCoordinates,
} from "./distance";
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

function headingDeltaDeg(fromBearing: number, toBearing: number): number {
  const raw = Math.abs(toBearing - fromBearing) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * Mean absolute heading change per kilometre.
 * Used to rank motorcycle corridors without collapsing to the fastest path (BR-003).
 */
export function headingChangePerKm(geometry: LineString): number {
  const lengthKm = lineStringLengthKm(geometry);
  if (lengthKm === 0 || geometry.coordinates.length < 3) {
    return 0;
  }

  let totalChange = 0;
  for (let index = 1; index < geometry.coordinates.length - 1; index += 1) {
    const previous = positionToCoordinates(geometry.coordinates[index - 1]);
    const current = positionToCoordinates(geometry.coordinates[index]);
    const next = positionToCoordinates(geometry.coordinates[index + 1]);
    const inbound = initialBearingDeg(previous, current);
    const outbound = initialBearingDeg(current, next);
    totalChange += headingDeltaDeg(inbound, outbound);
  }

  return totalChange / lengthKm;
}

/** Skip a join vertex when endpoints are within 15 m (FR-003, FR-026). */
const JOIN_ENDPOINT_TOLERANCE_KM = 0.015;

/** Join two traces without duplicating the shared endpoint (FR-003). */
export function joinLineStrings(
  first: LineString,
  second: LineString,
): LineString {
  if (first.coordinates.length === 0) {
    return { type: "LineString", coordinates: [...second.coordinates] };
  }
  if (second.coordinates.length === 0) {
    return { type: "LineString", coordinates: [...first.coordinates] };
  }

  const last = first.coordinates[first.coordinates.length - 1];
  const head = second.coordinates[0];
  const skipHead =
    last !== undefined &&
    head !== undefined &&
    haversineKm(positionToCoordinates(last), positionToCoordinates(head)) <=
      JOIN_ENDPOINT_TOLERANCE_KM;

  return {
    type: "LineString",
    coordinates: [
      ...first.coordinates,
      ...second.coordinates.slice(skipHead ? 1 : 0),
    ],
  };
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

/**
 * FR-046 — the heading a route leaves its start on, and the heading it arrives
 * at its end on. A gate drawn across the road has to sit square to the
 * traffic, and the first two vertices give that far more reliably than the
 * straight line between the two endpoints — which on a loop is undefined.
 *
 * `null` when the geometry has no direction to speak of (fewer than two
 * distinct points).
 */
export function endpointBearingsDeg(
  geometry: LineString,
): { start: number; end: number } | null {
  const points = geometry.coordinates.map(positionToCoordinates);
  if (points.length < 2) {
    return null;
  }

  const first = points[0];
  const outbound = points.find(
    (point) => haversineKm(first, point) > BEARING_MIN_SPAN_KM,
  );

  const last = points[points.length - 1];
  const inbound = [...points]
    .reverse()
    .find((point) => haversineKm(last, point) > BEARING_MIN_SPAN_KM);

  if (!outbound || !inbound) {
    return null;
  }

  return {
    start: initialBearingDeg(first, outbound),
    // The arrival heading, not the direction back down the route.
    end: initialBearingDeg(inbound, last),
  };
}

/**
 * Routing engines emit near-duplicate vertices; two of them a metre apart give
 * a bearing that is mostly rounding noise. Step out until the span is real.
 */
const BEARING_MIN_SPAN_KM = 0.005;

/**
 * FR-046 — points spaced every `intervalKm` along a route, for the kilometre
 * markers. The start is never one (it has its own gate) and a marker is never
 * placed within half an interval of the end, so the last one does not collide
 * with the finish gate.
 *
 * Each point carries the distance it stands for, so the caller can label it
 * without walking the line a second time.
 */
export function pointsAtIntervalKm(
  geometry: LineString,
  intervalKm: number,
): { coordinates: Coordinates; distanceKm: number }[] {
  if (intervalKm <= 0 || geometry.coordinates.length < 2) {
    return [];
  }

  const points = geometry.coordinates.map(positionToCoordinates);
  const totalKm = lineStringLengthKm(geometry);
  const markers: { coordinates: Coordinates; distanceKm: number }[] = [];

  let travelledKm = 0;
  let nextMarkKm = intervalKm;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const segmentKm = haversineKm(from, to);
    if (segmentKm === 0) {
      continue;
    }

    // A single long segment can hold several marks.
    while (nextMarkKm <= travelledKm + segmentKm) {
      if (nextMarkKm > totalKm - intervalKm / 2) {
        return markers;
      }
      const ratio = (nextMarkKm - travelledKm) / segmentKm;
      markers.push({
        coordinates: interpolateCoordinates(from, to, ratio),
        distanceKm: nextMarkKm,
      });
      nextMarkKm += intervalKm;
    }

    travelledKm += segmentKm;
  }

  return markers;
}

/**
 * Straight-line interpolation between two points. Over the sub-kilometre spans
 * a marker lands in, the error against a great circle is well under a metre.
 */
function interpolateCoordinates(
  from: Coordinates,
  to: Coordinates,
  ratio: number,
): Coordinates {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * ratio,
    longitude: from.longitude + (to.longitude - from.longitude) * ratio,
  };
}
