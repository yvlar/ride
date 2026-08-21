import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import type { GridCell, RouteKnowledgeDocument } from "./types";
import { undirectedEdgeId } from "./types";

export const DEFAULT_CELL_KM = 2;
const GRID_PADDING_CELLS = 2;

export function toCell(
  point: Coordinates,
  origin: Coordinates,
  cellKm: number,
): GridCell {
  const eastKm =
    (point.longitude - origin.longitude) *
    111.32 *
    Math.cos(((origin.latitude + point.latitude) / 2) * (Math.PI / 180));
  const northKm = (point.latitude - origin.latitude) * 111.32;

  return {
    x: Math.round(eastKm / cellKm),
    y: Math.round(northKm / cellKm),
  };
}

export function toCoordinates(
  cell: GridCell,
  origin: Coordinates,
  cellKm: number,
): Coordinates {
  const east = offsetCoordinates(origin, 90, Math.abs(cell.x) * cellKm);
  const withEast =
    cell.x < 0
      ? offsetCoordinates(origin, 270, Math.abs(cell.x) * cellKm)
      : east;
  if (cell.y === 0) {
    return withEast;
  }
  const bearing = cell.y > 0 ? 0 : 180;
  return offsetCoordinates(withEast, bearing, Math.abs(cell.y) * cellKm);
}

type EdgeKind = "highway" | "unpaved" | "scenic" | "curvy" | "touring";

function edgeKind(from: GridCell, to: GridCell): EdgeKind {
  const axis = from.x === to.x ? "ns" : "ew";
  const along = axis === "ew" ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
  const across = axis === "ew" ? from.y : from.x;
  if (across % 8 === 0) {
    return "highway";
  }
  if ((along + across) % 5 === 0) {
    return "unpaved";
  }
  if ((along + across) % 3 === 0) {
    return "scenic";
  }
  if ((along + across) % 2 === 0) {
    return "curvy";
  }
  return "touring";
}

function documentForEdge(
  fromCell: GridCell,
  toCell: GridCell,
  origin: Coordinates,
  cellKm: number,
): RouteKnowledgeDocument {
  const kind = edgeKind(fromCell, toCell);
  const from = toCoordinates(fromCell, origin, cellKm);
  const to = toCoordinates(toCell, origin, cellKm);
  const meta = EDGE_META[kind];
  return {
    id: undirectedEdgeId(fromCell, toCell),
    text: meta.text,
    roadName: meta.roadName,
    roadClass: meta.roadClass,
    surface: meta.surface,
    fromCell,
    toCell,
    from,
    to,
    midpoint: {
      latitude: (from.latitude + to.latitude) / 2,
      longitude: (from.longitude + to.longitude) / 2,
    },
  };
}

const EDGE_META: Record<
  EdgeKind,
  {
    text: string;
    roadName: string;
    roadClass: string;
    surface: RouteKnowledgeDocument["surface"];
  }
> = {
  highway: {
    text: "autoroute highway touring motorway paved rapide",
    roadName: "Autoroute",
    roadClass: "motorway",
    surface: "paved",
  },
  unpaved: {
    text: "unpaved gravel non pave forest adventure",
    roadName: "Chemin forestier",
    roadClass: "unclassified",
    surface: "unpaved",
  },
  scenic: {
    text: "scenic panoramique rural valley lac village secondary paved",
    roadName: "Rang panoramique",
    roadClass: "secondary",
    surface: "paved",
  },
  curvy: {
    text: "curvy sinueux ridge cretes secondary paved elevation",
    roadName: "Route sinueuse",
    roadClass: "secondary",
    surface: "paved",
  },
  touring: {
    text: "touring confort fluide secondary paved rolling",
    roadName: "Route de traverse",
    roadClass: "secondary",
    surface: "paved",
  },
};

/**
 * Local 4-connected road graph around the request. Each edge is a knowledge
 * document with real grid geometry (NFR-005) — never a scaled curve.
 */
export function buildLocalRoadIndex(
  origin: Coordinates,
  stops: Coordinates[],
  cellKm = DEFAULT_CELL_KM,
): RouteKnowledgeDocument[] {
  const cells = stops.map((stop) => toCell(stop, origin, cellKm));
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const minX = Math.min(...xs) - GRID_PADDING_CELLS;
  const maxX = Math.max(...xs) + GRID_PADDING_CELLS;
  const minY = Math.min(...ys) - GRID_PADDING_CELLS;
  const maxY = Math.max(...ys) + GRID_PADDING_CELLS;

  const documents: RouteKnowledgeDocument[] = [];
  for (let x = minX; x < maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      documents.push(
        documentForEdge({ x, y }, { x: x + 1, y }, origin, cellKm),
      );
    }
  }
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y < maxY; y += 1) {
      documents.push(
        documentForEdge({ x, y }, { x, y: y + 1 }, origin, cellKm),
      );
    }
  }
  return documents;
}
