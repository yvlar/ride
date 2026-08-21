import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import type { RideStyle } from "@/domain/ride/types";
import type { ProviderRouteRequest } from "@/infrastructure/routing/routing-provider";
import type {
  CorridorRetriever,
  RetrievedCorridor,
  RetrievalInput,
  RouteKnowledgeDocument,
} from "./types";

const LOOP_SEPARATION_KM = 1;
const SPATIAL_PAD_DEG = 0.2;

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
  const style = input.style ?? "touring";
  const styleTerms: Record<RideStyle, string> = {
    curvy: "curvy sinueux ridge secondary",
    scenic: "scenic panoramique rural valley lac",
    touring: "touring confort fluide secondary",
  };
  const kind = isLoop ? "boucle" : "destination";
  return `${kind} moto paved ${styleTerms[style]}`;
}

function relativeLongitude(longitude: number, originLongitude: number): number {
  let delta = longitude - originLongitude;
  while (delta > 180) {
    delta -= 360;
  }
  while (delta < -180) {
    delta += 360;
  }
  return delta;
}

function requestBBox(stops: Coordinates[]): {
  minLat: number;
  maxLat: number;
  minRelLon: number;
  maxRelLon: number;
  originLon: number;
} | null {
  const origin = stops[0];
  if (!origin) {
    return null;
  }
  const lats = stops.map((stop) => stop.latitude);
  const relLons = stops.map((stop) =>
    relativeLongitude(stop.longitude, origin.longitude),
  );
  return {
    minLat: Math.min(...lats) - SPATIAL_PAD_DEG,
    maxLat: Math.max(...lats) + SPATIAL_PAD_DEG,
    minRelLon: Math.min(...relLons) - SPATIAL_PAD_DEG,
    maxRelLon: Math.max(...relLons) + SPATIAL_PAD_DEG,
    originLon: origin.longitude,
  };
}

export function isSpatiallyRelevant(
  document: RouteKnowledgeDocument,
  stops: Coordinates[],
): boolean {
  const box = requestBBox(stops);
  if (!box) {
    return false;
  }
  const { latitude, longitude } = document.midpoint;
  const relLon = relativeLongitude(longitude, box.originLon);
  return (
    latitude >= box.minLat &&
    latitude <= box.maxLat &&
    relLon >= box.minRelLon &&
    relLon <= box.maxRelLon
  );
}

export class LexicalCorridorRetriever implements CorridorRetriever {
  async retrieve(input: RetrievalInput): Promise<RetrievedCorridor[]> {
    const queryTokens = tokenize(input.query);
    const nearby = input.documents.filter((document) =>
      isSpatiallyRelevant(document, input.stops),
    );
    return nearby
      .map((document) => ({
        document,
        score: lexicalScore(queryTokens, document.text),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.document.id.localeCompare(right.document.id),
      );
  }
}
