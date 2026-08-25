import {
  coordinatesToPosition,
  haversineKm,
  lineStringLengthKm,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { LOOP_CLOSURE_TOLERANCE_KM } from "@/domain/ride/constants";
import { AVERAGE_SPEED_KMH } from "@/domain/ride/duration";
import type { RouteSegment } from "@/domain/ride/types";
import { stepsFromGpxPath } from "./steps";
import type { GeneratedGpxRoute, ParsedGpxTrip } from "./types";

function placeFromPoint(
  point: Coordinates,
  label: string,
): GeneratedGpxRoute["start"] {
  return { label, coordinates: point };
}

function partLineString(points: ParsedGpxTrip["parts"][number]["points"]): LineString {
  return {
    type: "LineString",
    coordinates: points.map((point) =>
      coordinatesToPosition(point.coordinates),
    ),
  };
}

function concatenateParts(parts: LineString[]): {
  geometry: LineString;
  gapBeforeVertex: number[];
} {
  const coordinates: LineString["coordinates"] = [];
  const gapBeforeVertex: number[] = [];
  for (const part of parts) {
    if (part.coordinates.length === 0) {
      continue;
    }
    if (coordinates.length > 0) {
      gapBeforeVertex.push(coordinates.length);
    }
    coordinates.push(...part.coordinates);
  }
  return {
    geometry: { type: "LineString", coordinates },
    gapBeforeVertex,
  };
}

function segmentsFromParts(parts: LineString[], name?: string): RouteSegment[] {
  const segments: RouteSegment[] = [];
  parts.forEach((part, partIndex) => {
    for (let index = 1; index < part.coordinates.length; index += 1) {
      const from = positionToCoordinates(part.coordinates[index - 1]!);
      const to = positionToCoordinates(part.coordinates[index]!);
      const distanceKm = haversineKm(from, to);
      segments.push({
        id: `gpx:${partIndex}:${index - 1}`,
        geometry: {
          type: "LineString",
          coordinates: [part.coordinates[index - 1]!, part.coordinates[index]!],
        },
        distanceKm,
        durationMinutes: (distanceKm / AVERAGE_SPEED_KMH.touring) * 60,
        roadName: name,
        surface: "unknown",
      });
    }
  });
  return segments;
}

export function isClosedGpxLoop(geometry: LineString): boolean {
  if (geometry.coordinates.length < 3) {
    return false;
  }
  const start = positionToCoordinates(geometry.coordinates[0]!);
  const end = positionToCoordinates(
    geometry.coordinates[geometry.coordinates.length - 1]!,
  );
  return haversineKm(start, end) <= LOOP_CLOSURE_TOLERANCE_KM;
}

export function composeGpxRoute(input: {
  trip: ParsedGpxTrip;
  fileName: string;
  geometry?: LineString;
  warnings?: string[];
  id?: string;
}): GeneratedGpxRoute {
  const parts =
    input.geometry && input.trip.kind === "route"
      ? [input.geometry]
      : input.trip.parts.map((part) => partLineString(part.points));
  const { geometry, gapBeforeVertex } = concatenateParts(parts);
  const name = input.trip.name || input.fileName.replace(/\.gpx$/i, "") || "Trajet GPX";
  const startPoint = positionToCoordinates(geometry.coordinates[0]!);
  const endPoint = positionToCoordinates(
    geometry.coordinates[geometry.coordinates.length - 1]!,
  );
  const distanceKm = navigableLengthKm(geometry, gapBeforeVertex);
  const segments = segmentsFromParts(parts, name);
  const closed = isClosedGpxLoop(geometry);
  const warnings = [...(input.warnings ?? [])];
  if (input.trip.description) {
    warnings.push(input.trip.description);
  }

  return {
    id: input.id ?? `gpx:${input.trip.id}`,
    type: "gpx",
    source: "gpx",
    name,
    start: placeFromPoint(startPoint, name),
    destination: placeFromPoint(endPoint, closed ? name : "Arrivée GPX"),
    style: "touring",
    geometry,
    parts,
    gapBeforeVertex,
    segments,
    steps: stepsFromGpxPath(geometry, segments),
    distanceKm,
    durationMinutes: (distanceKm / AVERAGE_SPEED_KMH.touring) * 60,
    warnings,
    isClosedLoop: closed,
    trackKind: input.trip.kind,
    originalGeometry: geometry,
    originalParts: parts,
  };
}

export function navigableLengthKm(
  geometry: LineString,
  gapBeforeVertex: readonly number[],
): number {
  const gaps = new Set(gapBeforeVertex);
  let total = 0;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    if (gaps.has(index)) {
      continue;
    }
    total += haversineKm(
      positionToCoordinates(geometry.coordinates[index - 1]!),
      positionToCoordinates(geometry.coordinates[index]!),
    );
  }
  return total || lineStringLengthKm(geometry);
}

export function gpxRideRequestFromRoute(
  route: GeneratedGpxRoute,
): import("./types").GpxRideRequest {
  return {
    type: "gpx",
    start: route.start,
    destination: route.destination,
    name: route.name,
    style: route.style,
    preferences: { avoidHighways: false, avoidUnpaved: false },
  };
}

export function orderedRouteWaypoints(trip: ParsedGpxTrip): Coordinates[] {
  return trip.parts.flatMap((part) => part.points.map((point) => point.coordinates));
}
