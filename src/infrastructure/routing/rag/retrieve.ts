import { haversineKm } from "@/domain/geo/distance";
import type { ProviderRouteRequest } from "@/infrastructure/routing/routing-provider";
import { MOTORCYCLE_CORRIDOR_CORPUS } from "./corpus";
import type {
  CorridorRetriever,
  RetrievedCorridor,
  RouteKnowledgeDocument,
} from "./types";

const LOOP_SEPARATION_KM = 1;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 2);
}

export function lexicalScore(queryTokens: string[], documentText: string): number {
  const documentTokens = new Set(tokenize(documentText));
  let overlap = 0;
  for (const token of queryTokens) {
    if (documentTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

export function buildRouteRetrievalQuery(input: ProviderRouteRequest): string {
  const isLoop =
    haversineKm(input.start, input.destination) < LOOP_SEPARATION_KM;
  const via =
    (input.waypoints?.length ?? 0) > 0 ? " via waypoints points de passage" : "";

  if (isLoop) {
    return `boucle moto scenic curvy touring secondary paved rural ridge${via}`;
  }

  return `destination moto scenic curvy touring secondary paved valley rural${via}`;
}

export class LexicalCorridorRetriever implements CorridorRetriever {
  constructor(
    private readonly documents: RouteKnowledgeDocument[] = MOTORCYCLE_CORRIDOR_CORPUS,
  ) {}

  async retrieve(query: string, limit: number): Promise<RetrievedCorridor[]> {
    const queryTokens = tokenize(query);
    const ranked = this.documents
      .map((document) => ({
        document,
        score: lexicalScore(queryTokens, document.text),
      }))
      .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id));

    const positive = ranked.filter((entry) => entry.score > 0);
    const pool = positive.length > 0 ? positive : ranked;
    return pool.slice(0, Math.max(0, limit));
  }
}
