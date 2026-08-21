import {
  coordinatesToPosition,
  haversineKm,
  lineStringLengthKm,
  offsetCoordinates,
} from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import type { RouteSegment } from "@/domain/ride/types";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
} from "@/infrastructure/routing/routing-provider";
import type { OffsetKm, RetrievedCorridor } from "./types";

const RAG_SPEED_KMH = 60;
const MIN_SPAN_KM = 0.05;

export function eastNorthKm(
  origin: Coordinates,
  point: Coordinates,
): OffsetKm {
  const northKm = (point.latitude - origin.latitude) * 111.32;
  const eastKm =
    (point.longitude - origin.longitude) *
    111.32 *
    Math.cos(((origin.latitude + point.latitude) / 2) * (Math.PI / 180));
  return { eastKm, northKm };
}

export function offsetEastNorth(
  origin: Coordinates,
  offset: OffsetKm,
): Coordinates {
  const withEast =
    offset.eastKm >= 0
      ? offsetCoordinates(origin, 90, offset.eastKm)
      : offsetCoordinates(origin, 270, Math.abs(offset.eastKm));
  if (offset.northKm === 0) {
    return withEast;
  }
  return offset.northKm > 0
    ? offsetCoordinates(withEast, 0, offset.northKm)
    : offsetCoordinates(withEast, 180, Math.abs(offset.northKm));
}

/**
 * Similarity-transform a relative corridor so it starts at `from` and ends at `to`.
 * Coordinates come only from the retrieved document shape (NFR-005).
 */
export function instantiateRelativePath(
  relativePath: OffsetKm[],
  from: Coordinates,
  to: Coordinates,
): Coordinates[] {
  if (relativePath.length < 2) {
    return [from, to];
  }

  const first = relativePath[0];
  const last = relativePath[relativePath.length - 1];
  if (!first || !last) {
    return [from, to];
  }
  const srcEast = last.eastKm - first.eastKm;
  const srcNorth = last.northKm - first.northKm;
  const srcLen = Math.hypot(srcEast, srcNorth) || 1;
  const target = eastNorthKm(from, to);
  const dstLen = Math.hypot(target.eastKm, target.northKm);
  if (dstLen < MIN_SPAN_KM) {
    return [from, to];
  }

  const rotation =
    Math.atan2(target.northKm, target.eastKm) - Math.atan2(srcNorth, srcEast);
  const scale = dstLen / srcLen;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return relativePath.map((point, index) => {
    if (index === 0) {
      return from;
    }
    if (index === relativePath.length - 1) {
      return to;
    }
    const east = point.eastKm - first.eastKm;
    const north = point.northKm - first.northKm;
    return offsetEastNorth(from, {
      eastKm: (east * cos - north * sin) * scale,
      northKm: (east * sin + north * cos) * scale,
    });
  });
}

export function composeRetrievedRoute(
  input: ProviderRouteRequest,
  retrieved: RetrievedCorridor[],
): ProviderRouteResult {
  if (retrieved.length === 0) {
    throw new Error(
      "Aucun corridor connu n’a été retrouvé pour cette demande.",
    );
  }

  const stops = [input.start, ...(input.waypoints ?? []), input.destination];
  const points: Coordinates[] = [];
  const segments: RouteSegment[] = [];

  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = stops[index];
    const to = stops[index + 1];
    const retrievedCorridor = retrieved[index % retrieved.length];
    if (!from || !to || !retrievedCorridor) {
      continue;
    }
    const corridor = retrievedCorridor.document;
    const part = instantiateRelativePath(corridor.relativePath, from, to);
    const startAt = points.length === 0 ? 0 : 1;
    for (let partIndex = startAt; partIndex < part.length; partIndex += 1) {
      const current = part[partIndex];
      if (!current) {
        continue;
      }
      if (points.length === 0) {
        points.push(current);
        continue;
      }
      const previous = points[points.length - 1];
      if (!previous) {
        continue;
      }
      points.push(current);
      const distanceKm = haversineKm(previous, current);
      segments.push({
        id: `rag:${corridor.id}:${index}:${partIndex}`,
        geometry: {
          type: "LineString",
          coordinates: [
            coordinatesToPosition(previous),
            coordinatesToPosition(current),
          ],
        },
        distanceKm,
        durationMinutes: (distanceKm / RAG_SPEED_KMH) * 60,
        roadName: corridor.roadName,
        surface: corridor.surface,
        roadClass: corridor.roadClass,
      });
    }
  }

  if (points.length === 0) {
    points.push(input.start);
  }

  const geometry: LineString = {
    type: "LineString",
    coordinates: points.map(coordinatesToPosition),
  };
  const distanceKm = lineStringLengthKm(geometry);

  return {
    geometry,
    segments,
    distanceKm,
    durationMinutes: (distanceKm / RAG_SPEED_KMH) * 60,
  };
}
