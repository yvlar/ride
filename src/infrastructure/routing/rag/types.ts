import type { Coordinates } from "@/domain/geo/types";
import type { RouteSegment, ScenicLandscapeFeature } from "@/domain/ride/types";

export type GridCell = {
  x: number;
  y: number;
};

export type RouteKnowledgeDocument = {
  id: string;
  text: string;
  roadName: string;
  roadClass: string;
  surface: NonNullable<RouteSegment["surface"]>;
  landscapeFeatures?: ScenicLandscapeFeature[];
  fromCell: GridCell;
  toCell: GridCell;
  from: Coordinates;
  to: Coordinates;
  midpoint: Coordinates;
};

export type RetrievedCorridor = {
  document: RouteKnowledgeDocument;
  score: number;
};

export type RetrievalInput = {
  query: string;
  documents: RouteKnowledgeDocument[];
  stops: Coordinates[];
};

export interface CorridorRetriever {
  retrieve(input: RetrievalInput): Promise<RetrievedCorridor[]>;
};

export function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`;
}

export function undirectedEdgeId(a: GridCell, b: GridCell): string {
  const left = `${a.x},${a.y}`;
  const right = `${b.x},${b.y}`;
  return left < right ? `grid:${left}|${right}` : `grid:${right}|${left}`;
}
