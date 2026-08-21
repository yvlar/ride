import type { RouteSegment } from "@/domain/ride/types";

export type OffsetKm = {
  eastKm: number;
  northKm: number;
};

export type RouteKnowledgeDocument = {
  id: string;
  text: string;
  roadName: string;
  roadClass: string;
  surface: RouteSegment["surface"];
  relativePath: OffsetKm[];
};

export type RetrievedCorridor = {
  document: RouteKnowledgeDocument;
  score: number;
};

export interface CorridorRetriever {
  retrieve(query: string, limit: number): Promise<RetrievedCorridor[]>;
};
