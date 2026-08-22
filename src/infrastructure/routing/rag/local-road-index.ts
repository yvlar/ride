import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import type { ScenicLandscapeFeature } from "@/domain/ride/types";
import type { GridCell, RouteKnowledgeDocument } from "./types";
import { undirectedEdgeId } from "./types";

export const DEFAULT_CELL_KM = 2;
export const MAX_SPAN_CELLS = 250;
const GRID_PADDING_CELLS = 2;
const HIGHWAY_PHASE = 4;

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

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
  // Offset so the request origin (0,0) is not a motorway junction.
  // East/north origin edges would otherwise be unpaved (`along + across === 0`);
  // keep those two paved so a rider can leave the origin without a global
  // lattice shift that would break loop distance (BR-001) and style ranking.
  if (mod(across + HIGHWAY_PHASE, 8) === 0) {
    return "highway";
  }
  if (mod(along + across, 5) === 0 && !(along === 0 && across === 0)) {
    return "unpaved";
  }
  if (mod(along + across, 3) === 0) {
    return "scenic";
  }
  if (mod(along + across, 2) === 0) {
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
    landscapeFeatures: meta.landscapeFeatures,
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
    landscapeFeatures?: ScenicLandscapeFeature[];
  }
> = {
  highway: {
    text: "boucle destination autoroute highway touring motorway paved rapide",
    roadName: "Autoroute",
    roadClass: "motorway",
    surface: "paved",
  },
  unpaved: {
    text: "boucle destination unpaved gravel non pave forest adventure",
    roadName: "Chemin forestier",
    roadClass: "unclassified",
    surface: "unpaved",
  },
  scenic: {
    text: "boucle destination scenic panoramique rural valley lac village secondary paved",
    roadName: "Rang panoramique",
    roadClass: "secondary",
    surface: "paved",
    landscapeFeatures: ["rural", "lake", "village", "panoramic"],
  },
  curvy: {
    text: "boucle destination curvy sinueux ridge cretes secondary paved elevation",
    roadName: "Route sinueuse",
    roadClass: "secondary",
    surface: "paved",
  },
  touring: {
    text: "boucle destination touring confort fluide secondary paved rolling",
    roadName: "Route de traverse",
    roadClass: "secondary",
    surface: "paved",
  },
};

/**
 * Local 4-connected road graph around the request. Each edge is a knowledge
 * document with real grid geometry (NFR-005) — never a scaled curve.
 */
export function localGridSpanCells(
  origin: Coordinates,
  stops: Coordinates[],
  cellKm = DEFAULT_CELL_KM,
): { width: number; height: number } {
  const cells = stops.map((stop) => toCell(stop, origin, cellKm));
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + 2 * GRID_PADDING_CELLS,
    height: Math.max(...ys) - Math.min(...ys) + 2 * GRID_PADDING_CELLS,
  };
}

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
