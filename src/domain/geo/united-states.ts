import { positionToCoordinates } from "./distance";
import type { Coordinates, LineString, Position } from "./types";

type Ring = readonly Position[];

const CONTIGUOUS_US_BBOX = {
  west: -125.0,
  south: 24.4,
  east: -66.8,
  north: 49.45,
} as const;

const ALASKA_BBOX = {
  west: -168.5,
  south: 54.4,
  east: -129.9,
  north: 71.5,
} as const;

/**
 * Simplified contiguous United States, [longitude, latitude].
 * The northern edge follows the Canada border closely enough for motorcycle
 * routing (FR-028, BR-004). Not sourced from a named map vendor.
 */
const CONTIGUOUS_UNITED_STATES: Ring = [
  [-117.12, 32.53],
  [-117.4, 33.2],
  [-118.5, 33.8],
  [-120.5, 34.5],
  [-122.0, 36.6],
  [-122.5, 37.8],
  [-124.2, 40.4],
  [-124.5, 42.0],
  [-124.4, 43.5],
  [-124.1, 46.2],
  [-124.7, 47.9],
  [-124.75, 48.37],
  [-123.45, 48.12],
  [-122.95, 48.25],
  [-122.85, 48.5],
  [-122.76, 49.002],
  [-114.08, 49.0],
  [-104.05, 49.0],
  [-97.23, 49.0],
  [-95.16, 49.0],
  [-93.5, 48.6],
  [-90.4, 48.0],
  [-87.0, 46.5],
  [-84.75, 45.87],
  [-83.5, 45.4],
  [-82.5, 44.0],
  [-82.42, 43.0],
  [-82.42, 42.97],
  [-82.5, 42.6],
  [-82.87, 42.5],
  [-83.0, 42.4],
  [-83.041, 42.34],
  [-83.041, 42.325],
  [-83.1, 42.25],
  [-83.14, 42.15],
  [-83.14, 42.05],
  [-83.0, 41.7],
  [-81.7, 41.5],
  [-80.5, 42.15],
  [-79.1, 42.7],
  [-78.9, 42.88],
  [-79.02, 43.09],
  [-79.05, 43.262],
  [-77.5, 43.25],
  [-76.5, 43.5],
  [-76.2, 44.1],
  [-75.5, 44.6],
  [-75.0, 44.9],
  [-74.75, 45.0],
  [-74.0, 45.002],
  [-73.35, 45.002],
  [-72.1, 45.002],
  [-71.5, 45.005],
  [-71.38, 45.01],
  [-70.8, 45.25],
  [-70.3, 45.9],
  [-70.0, 46.69],
  [-69.22, 47.28],
  [-69.05, 47.45],
  [-67.79, 47.07],
  [-67.78, 45.57],
  [-67.279, 45.2],
  [-67.279, 45.16],
  [-67.15, 45.0],
  [-67.05, 44.8],
  [-67.5, 44.5],
  [-69.8, 43.5],
  [-70.5, 41.6],
  [-73.9, 40.5],
  [-74.0, 39.3],
  [-75.5, 35.2],
  [-81.0, 31.0],
  [-80.1, 27.0],
  [-80.0, 25.2],
  [-80.5, 24.9],
  [-81.7, 24.5],
  [-82.0, 26.5],
  [-82.7, 27.8],
  [-83.5, 29.8],
  [-84.0, 30.0],
  [-87.5, 30.3],
  [-89.0, 28.9],
  [-94.0, 29.5],
  [-97.1, 25.9],
  [-99.0, 26.8],
  [-101.5, 29.3],
  [-103.0, 29.0],
  [-104.5, 29.8],
  [-106.5, 31.8],
  [-111.0, 31.3],
  [-114.8, 32.5],
];

/** Mainland Alaska plus a thin panhandle. Yukon stays outside (FR-028). */
const ALASKA: Ring = [
  [-168.0, 54.5],
  [-152.0, 57.5],
  [-141.0, 60.3],
  [-137.0, 59.0],
  [-135.5, 57.8],
  [-134.5, 58.4],
  [-133.0, 56.8],
  [-131.5, 55.3],
  [-130.04, 55.92],
  [-130.04, 54.75],
  [-133.0, 55.5],
  [-135.0, 57.0],
  [-137.5, 58.5],
  [-141.0, 60.3],
  [-141.0, 69.6],
  [-156.5, 71.4],
  [-168.0, 68.0],
];

/**
 * FR-028 — geographic fact, not a geocoder country field (BR-004).
 */
export function isInUnitedStates(point: Coordinates): boolean {
  const position: Position = [point.longitude, point.latitude];
  if (inBox(position, CONTIGUOUS_US_BBOX)) {
    return pointInRing(position, CONTIGUOUS_UNITED_STATES);
  }
  if (inBox(position, ALASKA_BBOX)) {
    return pointInRing(position, ALASKA);
  }
  return false;
}

/** FR-028 — true when any vertex of the line is in the United States. */
export function geometryEntersUnitedStates(geometry: LineString): boolean {
  return geometry.coordinates.some((position) =>
    isInUnitedStates(positionToCoordinates(position)),
  );
}

function inBox(
  position: Position,
  box: { west: number; south: number; east: number; north: number },
): boolean {
  const [longitude, latitude] = position;
  return (
    longitude >= box.west &&
    longitude <= box.east &&
    latitude >= box.south &&
    latitude <= box.north
  );
}

/** Even-odd ray cast toward increasing longitude. */
function pointInRing(point: Position, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  const length = ring.length;
  for (let index = 0, previous = length - 1; index < length; previous = index, index += 1) {
    const current = ring[index];
    const prior = ring[previous];
    if (!current || !prior) {
      continue;
    }
    const [xi, yi] = current;
    const [xj, yj] = prior;
    const straddles = yi > y !== yj > y;
    if (!straddles) {
      continue;
    }
    const intersectionX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < intersectionX) {
      inside = !inside;
    }
  }
  return inside;
}
