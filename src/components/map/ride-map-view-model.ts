import { boundingBox } from "@/domain/geo/bounds";
import {
  haversineKm,
  initialBearingDeg,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { BoundingBox, Coordinates, LineString } from "@/domain/geo/types";
import type { GeneratedRideRoute } from "@/domain/ride/types";

export type RideMapMarker = {
  kind: "start" | "destination";
  label: string;
  placeLabel: string;
  coordinates: Coordinates;
};

export type RideMapArrow = {
  coordinates: Coordinates;
  bearingDeg: number;
};

export type RideMapViewModel = {
  geometry: LineString;
  bounds: BoundingBox;
  start: RideMapMarker;
  destination?: RideMapMarker;
  directionLabel: string;
  directionArrows: RideMapArrow[];
};

export function toRideMapViewModel(
  route: GeneratedRideRoute,
): RideMapViewModel | null {
  if (route.geometry.coordinates.length < 2) {
    return null;
  }

  const extra = [route.start.coordinates];
  if (route.type !== "loop") {
    extra.push(route.destination.coordinates);
  }

  const bounds = boundingBox(route.geometry, extra);
  if (!bounds) {
    return null;
  }

  const start: RideMapMarker = {
    kind: "start",
    label: "Départ",
    placeLabel: route.start.label,
    coordinates: route.start.coordinates,
  };

  const destination: RideMapMarker | undefined =
    route.type === "loop"
      ? undefined
      : {
          kind: "destination",
          label: "Destination",
          placeLabel: route.destination.label,
          coordinates: route.destination.coordinates,
        };

  return {
    geometry: route.geometry,
    bounds,
    start,
    destination,
    directionLabel: directionLabel(route),
    directionArrows: sampleDirectionArrows(route.geometry),
  };
}

function directionLabel(route: GeneratedRideRoute): string {
  if (route.type === "loop") {
    return `Sens : boucle depuis ${route.start.label}`;
  }
  if (route.type === "round_trip") {
    return `Sens : ${route.start.label} → ${route.destination.label} → ${route.start.label}`;
  }
  return `Sens : ${route.start.label} → ${route.destination.label}`;
}

export function sampleDirectionArrows(
  geometry: LineString,
  fractions: number[] = [0.25, 0.5, 0.75],
): RideMapArrow[] {
  const arrows: RideMapArrow[] = [];
  for (const fraction of fractions) {
    const sampled = interpolateAlongLine(geometry, fraction);
    if (sampled) {
      arrows.push(sampled);
    }
  }
  return arrows;
}

function interpolateAlongLine(
  geometry: LineString,
  fraction: number,
): RideMapArrow | null {
  if (geometry.coordinates.length < 2) {
    return null;
  }

  const points = geometry.coordinates.map(positionToCoordinates);
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(
      distances[index - 1]! + haversineKm(points[index - 1]!, points[index]!),
    );
  }

  const total = distances[distances.length - 1]!;
  if (total === 0) {
    return null;
  }

  const target = total * fraction;
  for (let index = 1; index < points.length; index += 1) {
    if (distances[index]! < target) {
      continue;
    }

    const from = points[index - 1]!;
    const to = points[index]!;
    const segment = distances[index]! - distances[index - 1]!;
    const t = segment === 0 ? 0 : (target - distances[index - 1]!) / segment;

    return {
      coordinates: {
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      },
      bearingDeg: initialBearingDeg(from, to),
    };
  }

  const last = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  return {
    coordinates: last,
    bearingDeg: initialBearingDeg(previous, last),
  };
}
