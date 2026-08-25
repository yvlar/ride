import {
  coordinatesToPosition,
  haversineKm,
  initialBearingDeg,
  lineStringLengthKm,
  offsetCoordinates,
} from "@/domain/geo/distance";
import type { Coordinates, LineString, Position } from "@/domain/geo/types";
import { stepsFromPath } from "@/domain/navigation/steps-from-path";
import type { RouteSegment } from "@/domain/ride/types";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";

const POINTS_PER_LEG = 12;
const SPEED_KMH = 60;

/**
 * Deterministic road-like trace that follows via-points without collapsing
 * onto a Manhattan grid through the origin. Used by FR-034 tests.
 */
export class GeodesicRoutingProvider implements RoutingProvider {
  async calculateRoute(
    input: ProviderRouteRequest,
  ): Promise<ProviderRouteResult> {
    const stops = [input.start, ...(input.waypoints ?? []), input.destination];
    const coordinates: Position[] = [];
    const segments: RouteSegment[] = [];

    for (let index = 0; index < stops.length - 1; index += 1) {
      const from = stops[index];
      const to = stops[index + 1];
      const leg = densifyLeg(from, to);
      if (index > 0) {
        leg.shift();
      }
      coordinates.push(
        ...leg.map((point) => coordinatesToPosition(point)),
      );
      const geometry: LineString = {
        type: "LineString",
        coordinates: leg.map((point) => coordinatesToPosition(point)),
      };
      const distanceKm = lineStringLengthKm(geometry);
      segments.push({
        id: `geo:${index}`,
        geometry,
        distanceKm,
        durationMinutes: (distanceKm / SPEED_KMH) * 60,
        roadName: `Corridor ${index + 1}`,
        surface: "paved",
        roadClass: "secondary",
      });
    }

    const geometry: LineString = { type: "LineString", coordinates };
    const distanceKm = lineStringLengthKm(geometry);
    return {
      geometry,
      segments:
        segments.length > 0
          ? segments
          : [
              {
                id: "geo:0",
                geometry,
                distanceKm,
                durationMinutes: (distanceKm / SPEED_KMH) * 60,
                surface: "paved",
                roadClass: "secondary",
              },
            ],
      steps: stepsFromPath(geometry, segments),
      distanceKm,
      durationMinutes: (distanceKm / SPEED_KMH) * 60,
    };
  }
}

export function elongatedLoopVias(
  origin: Coordinates,
  targetDistanceKm: number,
  headingOffsetDeg = 0,
): Coordinates[] {
  const longKm = targetDistanceKm * 0.22;
  const wideKm = targetDistanceKm * 0.28;
  const north = offsetCoordinates(origin, headingOffsetDeg, longKm);
  const northEast = offsetCoordinates(north, headingOffsetDeg + 90, wideKm);
  const east = offsetCoordinates(origin, headingOffsetDeg + 90, wideKm);
  return [north, northEast, east];
}

export function elongatedLoopCandidate(
  origin: Coordinates,
  targetDistanceKm: number,
  headingOffsetDeg = 0,
  sourceResultIds = ["web-1", "web-2"],
) {
  const vias = elongatedLoopVias(origin, targetDistanceKm, headingOffsetDeg);
  const labels = ["Chemin des crêtes", "Belvédère de Bolton", "Village d’Eastman"];
  return {
    candidateName: `Corridor ${headingOffsetDeg}`,
    viaPoints: vias.map((point, index) => ({
      label: labels[index] ?? `Via ${index + 1}`,
      latitude: point.latitude,
      longitude: point.longitude,
      sourceResultIds,
    })),
    roads: ["Chemin des crêtes"],
    pointsOfInterest: ["Belvédère de Bolton"],
  };
}

function densifyLeg(from: Coordinates, to: Coordinates): Coordinates[] {
  const distanceKm = haversineKm(from, to);
  if (distanceKm === 0) {
    return [from];
  }
  const bearing = initialBearingDeg(from, to);
  const points: Coordinates[] = [from];
  for (let step = 1; step < POINTS_PER_LEG; step += 1) {
    points.push(
      offsetCoordinates(from, bearing, (distanceKm * step) / POINTS_PER_LEG),
    );
  }
  points.push(to);
  return points;
}
