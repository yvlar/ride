import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";
import { composeRetrievedRoute } from "./compose";
import {
  buildLocalRoadIndex,
  DEFAULT_CELL_KM,
  toCell,
} from "./local-road-index";
import { pathfindOnRetrieved } from "./pathfind";
import { buildRouteRetrievalQuery, isSpatiallyRelevant, LexicalCorridorRetriever } from "./retrieve";
import { RoutingKnowledgeError } from "./routing-knowledge-error";
import type { CorridorRetriever, RouteKnowledgeDocument } from "./types";

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
      throw new RoutingKnowledgeError();
    }

    const style = input.style ?? "touring";
    const path: RouteKnowledgeDocument[] = [];
    for (let index = 0; index < stops.length - 1; index += 1) {
      const from = stops[index];
      const to = stops[index + 1];
      if (!from || !to) {
        throw new RoutingKnowledgeError();
      }
      const part = pathfindOnRetrieved(
        toCell(from, input.start, this.cellKm),
        toCell(to, input.start, this.cellKm),
        retrieved,
        style,
        input.preferences,
      );
      if (part === null) {
        throw new RoutingKnowledgeError();
      }
      path.push(...part);
    }

    return composeRetrievedRoute(input.start, input.destination, path);
  }
}
