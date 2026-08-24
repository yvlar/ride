import type { RouteSegment } from "@/domain/ride/types";
import { HIGHWAY_ROAD_CLASSES } from "@/domain/ride/constants";

const HIGHWAY = new Set<string>(HIGHWAY_ROAD_CLASSES);

export type RouteShareSummary = {
  highwayPercent: number | null;
  unpavedPercent: number | null;
  unknownSurface: boolean;
};

/**
 * FR-020 — only report shares when the provider actually tagged segments.
 */
export function routeShareSummary(segments: RouteSegment[]): RouteShareSummary {
  const total = segments.reduce((sum, segment) => sum + segment.distanceKm, 0);
  if (!(total > 0)) {
    return { highwayPercent: null, unpavedPercent: null, unknownSurface: false };
  }

  const highwayKm = segments.reduce(
    (sum, segment) =>
      segment.roadClass && HIGHWAY.has(segment.roadClass)
        ? sum + segment.distanceKm
        : sum,
    0,
  );
  const unpavedKm = segments.reduce(
    (sum, segment) =>
      segment.surface === "unpaved" ? sum + segment.distanceKm : sum,
    0,
  );
  const knownSurfaceKm = segments.reduce((sum, segment) => {
    if (segment.surface === "paved" || segment.surface === "unpaved") {
      return sum + segment.distanceKm;
    }
    return sum;
  }, 0);
  const classifiedHighway = segments.some((segment) => Boolean(segment.roadClass));

  return {
    highwayPercent: classifiedHighway
      ? Math.round((highwayKm / total) * 100)
      : null,
    unpavedPercent:
      knownSurfaceKm > 0 ? Math.round((unpavedKm / total) * 100) : null,
    unknownSurface: knownSurfaceKm < total,
  };
}

export function principalRoadNames(segments: RouteSegment[], limit = 3): string[] {
  const names: string[] = [];
  for (const segment of segments) {
    const name = segment.roadName?.trim();
    if (!name || names.includes(name)) {
      continue;
    }
    names.push(name);
    if (names.length >= limit) {
      break;
    }
  }
  return names;
}
