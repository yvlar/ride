import type { RideStyle, RoutePreferences } from "@/domain/ride/types";
import { isInUnitedStates } from "@/domain/geo/united-states";
import type { RetrievedCorridor, RouteKnowledgeDocument } from "./types";
import { cellKey, type GridCell } from "./types";

type AdjEdge = {
  to: GridCell;
  cost: number;
  document: RouteKnowledgeDocument;
};

type HeapItem = {
  key: string;
  dist: number;
};

class MinHeap {
  private readonly items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (top === undefined || last === undefined) {
      return undefined;
    }
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sink(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const currentItem = this.items[index];
      const parentItem = this.items[parent];
      if (!currentItem || !parentItem || currentItem.dist >= parentItem.dist) {
        return;
      }
      this.items[index] = parentItem;
      this.items[parent] = currentItem;
      index = parent;
    }
  }

  private sink(index: number): void {
    const length = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < length &&
        this.items[left] &&
        this.items[smallest] &&
        this.items[left].dist < this.items[smallest].dist
      ) {
        smallest = left;
      }
      if (
        right < length &&
        this.items[right] &&
        this.items[smallest] &&
        this.items[right].dist < this.items[smallest].dist
      ) {
        smallest = right;
      }
      if (smallest === index) {
        return;
      }
      const currentItem = this.items[index];
      const smallestItem = this.items[smallest];
      if (!currentItem || !smallestItem) {
        return;
      }
      this.items[index] = smallestItem;
      this.items[smallest] = currentItem;
      index = smallest;
    }
  }
}

function edgePenalty(
  document: RouteKnowledgeDocument,
  score: number,
  style: RideStyle,
  preferences: RoutePreferences | undefined,
): number | null {
  if (preferences?.avoidUnpaved && document.surface === "unpaved") {
    return null;
  }
  if (
    preferences?.stayInCanada &&
    (isInUnitedStates(document.from) ||
      isInUnitedStates(document.to) ||
      isInUnitedStates(document.midpoint))
  ) {
    return null;
  }

  let penalty = 1;
  if (document.roadClass === "motorway") {
    if (preferences?.avoidHighways) {
      penalty *= 12;
    } else if (style === "curvy" || style === "scenic") {
      penalty *= 8;
    } else if (style === "fastest") {
      penalty *= 0.82;
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
  if (
    style === "fastest" &&
    /\b(?:rapide|direct|highway|motorway)\b/.test(document.text)
  ) {
    penalty *= 0.75;
  }
  return penalty / (1 + 0.15 * score);
}

function buildAdjacency(
  retrieved: RetrievedCorridor[],
  style: RideStyle,
  preferences: RoutePreferences | undefined,
): Map<string, AdjEdge[]> {
  const adj = new Map<string, AdjEdge[]>();

  const add = (
    from: GridCell,
    to: GridCell,
    cost: number,
    document: RouteKnowledgeDocument,
  ) => {
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
  const heap = new MinHeap();
  heap.push({ key: startKey, dist: 0 });
  const seen = new Set<string>();

  while (heap.size > 0) {
    const current = heap.pop();
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
