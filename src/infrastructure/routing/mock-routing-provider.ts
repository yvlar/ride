import {
  coordinatesToPosition,
  haversineKm,
  lineStringLengthKm,
  offsetCoordinates,
} from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import type { RouteSegment } from "@/domain/ride/types";
import { RagRoutingProvider } from "./rag/rag-routing-provider";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "./routing-provider";

type GridCell = {
  x: number;
  y: number;
};

const DEFAULT_CELL_KM = 2;
const MOCK_SPEED_KMH = 60;

/**
 * Deterministic stand-in for a road network: a 4-connected grid around the start.
 * The result is a rectilinear path, never a perfect geometric circle.
 */
export class MockRoutingProvider implements RoutingProvider {
  private ragProvider?: RagRoutingProvider;

  constructor(private readonly cellKm = DEFAULT_CELL_KM) {}

  async calculateRoute(
    input: ProviderRouteRequest,
  ): Promise<ProviderRouteResult> {
    if (input.preferences?.avoidUnpaved) {
      this.ragProvider ??= new RagRoutingProvider(undefined, this.cellKm);
      return this.ragProvider.calculateRoute(input);
    }

    const origin = input.start;
    const stops = [input.start, ...(input.waypoints ?? []), input.destination];
    const cells = stops.map((stop) => this.toCell(stop, origin));
    const pathCells: GridCell[] = [];

    for (let index = 0; index < cells.length - 1; index += 1) {
      const part = manhattanPath(cells[index], cells[index + 1]);
      if (index > 0) {
        part.shift();
      }
      pathCells.push(...part);
    }

    if (pathCells.length === 0) {
      pathCells.push(this.toCell(origin, origin));
    }

    const coordinates = pathCells.map((cell) =>
      coordinatesToPosition(this.toCoordinates(cell, origin)),
    );
    const geometry: LineString = {
      type: "LineString",
      coordinates,
    };
    const segments = this.toSegments(pathCells, origin);
    const distanceKm = lineStringLengthKm(geometry);

    return {
      geometry,
      segments,
      distanceKm,
      durationMinutes: (distanceKm / MOCK_SPEED_KMH) * 60,
    };
  }

  private toCell(point: Coordinates, origin: Coordinates): GridCell {
    const eastKm =
      (point.longitude - origin.longitude) *
      111.32 *
      Math.cos(((origin.latitude + point.latitude) / 2) * (Math.PI / 180));
    const northKm = (point.latitude - origin.latitude) * 111.32;

    return {
      x: Math.round(eastKm / this.cellKm),
      y: Math.round(northKm / this.cellKm),
    };
  }

  private toCoordinates(cell: GridCell, origin: Coordinates): Coordinates {
    const east = offsetCoordinates(origin, 90, Math.abs(cell.x) * this.cellKm);
    const withEast =
      cell.x < 0
        ? offsetCoordinates(origin, 270, Math.abs(cell.x) * this.cellKm)
        : east;
    if (cell.y === 0) {
      return withEast;
    }
    const bearing = cell.y > 0 ? 0 : 180;
    return offsetCoordinates(withEast, bearing, Math.abs(cell.y) * this.cellKm);
  }

  private toSegments(pathCells: GridCell[], origin: Coordinates): RouteSegment[] {
    const segments: RouteSegment[] = [];
    for (let index = 1; index < pathCells.length; index += 1) {
      const from = pathCells[index - 1];
      const to = pathCells[index];
      const fromCoord = this.toCoordinates(from, origin);
      const toCoord = this.toCoordinates(to, origin);
      const distanceKm = haversineKm(fromCoord, toCoord);
      const a = `${from.x},${from.y}`;
      const b = `${to.x},${to.y}`;
      const id = a < b ? `grid:${a}|${b}` : `grid:${b}|${a}`;

      segments.push({
        id,
        geometry: {
          type: "LineString",
          coordinates: [
            coordinatesToPosition(fromCoord),
            coordinatesToPosition(toCoord),
          ],
        },
        distanceKm,
        durationMinutes: (distanceKm / MOCK_SPEED_KMH) * 60,
        roadName: `Grid ${id}`,
        surface: "paved",
        roadClass: "secondary",
      });
    }
    return segments;
  }
}

function manhattanPath(from: GridCell, to: GridCell): GridCell[] {
  const path: GridCell[] = [{ ...from }];
  let x = from.x;
  let y = from.y;
  const stepX = Math.sign(to.x - from.x) || 0;
  const stepY = Math.sign(to.y - from.y) || 0;

  const largerDeltaIsX = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  if (largerDeltaIsX) {
    while (x !== to.x) {
      x += stepX;
      path.push({ x, y });
    }
    while (y !== to.y) {
      y += stepY;
      path.push({ x, y });
    }
  } else {
    while (y !== to.y) {
      y += stepY;
      path.push({ x, y });
    }
    while (x !== to.x) {
      x += stepX;
      path.push({ x, y });
    }
  }

  return path;
}
