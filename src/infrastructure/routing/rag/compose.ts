import {
  coordinatesToPosition,
  haversineKm,
  lineStringLengthKm,
} from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import type { RouteSegment } from "@/domain/ride/types";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";
import type { RouteKnowledgeDocument } from "./types";

const RAG_SPEED_KMH = 60;

function orientedTo(
  document: RouteKnowledgeDocument,
  current: Coordinates,
): Coordinates {
  const fromDist = haversineKm(current, document.from);
  const toDist = haversineKm(current, document.to);
  return fromDist <= toDist ? document.to : document.from;
}

export function composeRetrievedRoute(
  start: Coordinates,
  destination: Coordinates,
  path: RouteKnowledgeDocument[],
): ProviderRouteResult {
  const points: Coordinates[] = [start];
  const segments: RouteSegment[] = [];

  let current = start;
  for (const document of path) {
    const next = orientedTo(document, current);
    const distanceKm = haversineKm(current, next);
    segments.push({
      id: document.id,
      geometry: {
        type: "LineString",
        coordinates: [
          coordinatesToPosition(current),
          coordinatesToPosition(next),
        ],
      },
      distanceKm,
      durationMinutes: (distanceKm / RAG_SPEED_KMH) * 60,
      roadName: document.roadName,
      surface: document.surface,
      roadClass: document.roadClass,
    });
    points.push(next);
    current = next;
  }

  if (path.length === 0) {
    points.push(destination);
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
