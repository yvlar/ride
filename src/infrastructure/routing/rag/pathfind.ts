import type { RideStyle, RoutePreferences } from "@/domain/ride/types";
import type { RetrievedCorridor, RouteKnowledgeDocument } from "./types";
import { cellKey, type GridCell } from "./types";

type AdjEdge = {
  to: GridCell;
  cost: number;
  document: RouteKnowledgeDocument;
};

function edgePenalty(
  document: RouteKnowledgeDocument,
  score: number,
  style: RideStyle,
  preferences: RoutePreferences | undefined,
): number | null {
  if (preferences?.avoidUnpaved && document.surface === "unpaved") {
    return null;
  }

  let penalty = 1;
  if (document.roadClass === "motorway") {
    if (preferences?.avoidHighways) {
      penalty *= 12;
    } else if (style === "curvy" || style === "scenic") {
      penalty *= 8;
    } else {
      penalty *= 1.05;
    }
  }
  if (document.surface === "unpaved") {
    penalty *= 4;
  }
  if (style === "curvy" && document.text.includes("curvy")) {
    penalty *= 0.55;
  }
  if (style === "scenic" && document.text.includes("scenic")) {
    penalty *= 0.55;
  }
  if (style === "touring" && document.text.includes("touring")) {
    penalty *= 0.7;
  }
  return penalty / (1 + 0.15 * score);
}

function buildAdjacency(
  retrieved: RetrievedCorridor[],
  style: RideStyle,
  preferences: RoutePreferences | undefined,
): Map<string, AdjEdge[]> {
  const adj = new Map<string, AdjEdge[]>();

  const add = (from: GridCell, to: GridCell, cost: number, document: RouteKnowledgeDocument) => {
    const key = cellKey(from);
    const edges = adj.get(key) ?? [];
    edges.push({ to, cost, document });
    adj.set(key, edges);
  };

  for (const { document, score } of retrieved) {
    const penalty = edgePenalty(document, score, style, preferences);
    if (penalty === null) {
      continue;
    }
    add(document.fromCell, document.toCell, penalty, document);
    add(document.toCell, document.fromCell, penalty, document);
  }
  return adj;
}

function popMin(
  heap: { key: string; dist: number }[],
): { key: string; dist: number } | undefined {
  if (heap.length === 0) {
    return undefined;
  }
  let bestIndex = 0;
  for (let index = 1; index < heap.length; index += 1) {
    const candidate = heap[index];
    const best = heap[bestIndex];
    if (candidate && best && candidate.dist < best.dist) {
      bestIndex = index;
    }
  }
  return heap.splice(bestIndex, 1)[0];
}

/**
 * Least-cost path on retrieved edges only. Missing connectivity is a knowledge
 * miss, not a license to invent geometry (NFR-005).
 */
export function pathfindOnRetrieved(
  from: GridCell,
  to: GridCell,
  retrieved: RetrievedCorridor[],
  style: RideStyle = "touring",
  preferences?: RoutePreferences,
): RouteKnowledgeDocument[] | null {
  if (from.x === to.x && from.y === to.y) {
    return [];
  }

  const adj = buildAdjacency(retrieved, style, preferences);
  const startKey = cellKey(from);
  const goalKey = cellKey(to);
  if (!adj.has(startKey) || !adj.has(goalKey)) {
    return null;
  }

  const dist = new Map<string, number>([[startKey, 0]]);
  const prev = new Map<
    string,
    { from: string; document: RouteKnowledgeDocument }
  >();
  const heap: { key: string; dist: number }[] = [{ key: startKey, dist: 0 }];
  const seen = new Set<string>();

  while (heap.length > 0) {
    const current = popMin(heap);
    if (!current || seen.has(current.key)) {
      continue;
    }
    seen.add(current.key);
    if (current.key === goalKey) {
      break;
    }
    for (const edge of adj.get(current.key) ?? []) {
      const nextKey = cellKey(edge.to);
      const nextDist = current.dist + edge.cost;
      if (nextDist < (dist.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        dist.set(nextKey, nextDist);
        prev.set(nextKey, { from: current.key, document: edge.document });
        heap.push({ key: nextKey, dist: nextDist });
      }
    }
  }

  if (!prev.has(goalKey) && startKey !== goalKey) {
    return null;
  }

  const path: RouteKnowledgeDocument[] = [];
  let cursor = goalKey;
  while (cursor !== startKey) {
    const step = prev.get(cursor);
    if (!step) {
      return null;
    }
    path.push(step.document);
    cursor = step.from;
  }
  path.reverse();
  return path;
}
