import type { RoutePreferences } from "@/domain/ride/types";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";
import { composeRetrievedRoute } from "./compose";
import {
  buildLocalRoadIndex,
  DEFAULT_CELL_KM,
  localGridSpanCells,
  MAX_SPAN_CELLS,
  toCell,
} from "./local-road-index";
import { pathfindOnRetrieved } from "./pathfind";
import { buildRouteRetrievalQuery, isSpatiallyRelevant, LexicalCorridorRetriever } from "./retrieve";
import {
  canadaOnlyKnowledgeError,
  disconnectedKnowledgeError,
  emptyKnowledgeError,
  tooFarKnowledgeError,
  unpavedKnowledgeError,
} from "../routing-knowledge-error";
import type {
  CorridorRetriever,
  RetrievedCorridor,
  RouteKnowledgeDocument,
} from "./types";

/**
 * NFR-005 / BR-004 — RAG routing adapter on a local road graph.
 * Retrieve nearby grid edges, then pathfind using only those documents.
 */
export class RagRoutingProvider implements RoutingProvider {
  constructor(
    private readonly retriever: CorridorRetriever = new LexicalCorridorRetriever(),
    private readonly cellKm = DEFAULT_CELL_KM,
  ) {}

  async calculateRoute(
    input: ProviderRouteRequest,
  ): Promise<ProviderRouteResult> {
    const stops = [input.start, ...(input.waypoints ?? []), input.destination];
    const span = localGridSpanCells(input.start, stops, this.cellKm);
    if (span.width > MAX_SPAN_CELLS || span.height > MAX_SPAN_CELLS) {
      throw tooFarKnowledgeError();
    }

    const documents = buildLocalRoadIndex(input.start, stops, this.cellKm);
    const nearby = await this.retriever.retrieve({
      query: buildRouteRetrievalQuery(input),
      documents,
      stops,
    });
    const retrieved = nearby.filter((entry) =>
      isSpatiallyRelevant(entry.document, stops),
    );

    if (retrieved.length === 0) {
      throw emptyKnowledgeError();
    }

    const style = input.style ?? "touring";
    const path: RouteKnowledgeDocument[] = [];
    for (let index = 0; index < stops.length - 1; index += 1) {
      const from = stops[index];
      const to = stops[index + 1];
      if (!from || !to) {
        throw disconnectedKnowledgeError();
      }
      path.push(
        ...this.pathBetween(from, to, input.start, retrieved, style, input.preferences),
      );
    }

    return composeRetrievedRoute(input.start, input.destination, path);
  }

  private pathBetween(
    from: ProviderRouteRequest["start"],
    to: ProviderRouteRequest["start"],
    origin: ProviderRouteRequest["start"],
    retrieved: RetrievedCorridor[],
    style: NonNullable<ProviderRouteRequest["style"]>,
    preferences: RoutePreferences | undefined,
  ): RouteKnowledgeDocument[] {
    const part = pathfindOnRetrieved(
      toCell(from, origin, this.cellKm),
      toCell(to, origin, this.cellKm),
      retrieved,
      style,
      preferences,
    );
    if (part !== null) {
      return part;
    }

    if (preferences?.avoidUnpaved) {
      const withoutSurface = pathfindOnRetrieved(
        toCell(from, origin, this.cellKm),
        toCell(to, origin, this.cellKm),
        retrieved,
        style,
        { ...preferences, avoidUnpaved: false },
      );
      if (withoutSurface !== null) {
        throw unpavedKnowledgeError();
      }
    }

    if (preferences?.stayInCanada) {
      const withoutCanada = pathfindOnRetrieved(
        toCell(from, origin, this.cellKm),
        toCell(to, origin, this.cellKm),
        retrieved,
        style,
        { ...preferences, stayInCanada: false },
      );
      if (withoutCanada !== null) {
        throw canadaOnlyKnowledgeError();
      }
    }

    throw disconnectedKnowledgeError();
  }
}
