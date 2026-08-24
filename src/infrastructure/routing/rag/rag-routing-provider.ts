import type { RoutePreferences } from "@/domain/ride/types";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
  RoutingProviderOptions,
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
  sampleCorridorViaPoints,
  thinCorridorViaPoints,
  uniqueWaypointAttempts,
} from "./sample-corridor-via-points";
import {
  canadaOnlyKnowledgeError,
  disconnectedKnowledgeError,
  emptyKnowledgeError,
  isRoutingKnowledgeError,
  tooFarKnowledgeError,
  unpavedKnowledgeError,
} from "../routing-knowledge-error";
import type {
  CorridorRetriever,
  RetrievedCorridor,
  RouteKnowledgeDocument,
} from "./types";

export type RagRoutingProviderOptions = {
  cellKm?: number;
  /** Road-network adapter that produces the displayed, navigable geometry. */
  roadNetwork?: RoutingProvider;
};

/**
 * NFR-005 / BR-004 / FR-029 — RAG routing adapter on a local road graph.
 * Retrieve nearby grid edges, pathfind using only those documents, then snap
 * the corridor onto the configured road-network adapter when one is present.
 * Production wiring (`createRoutingProvider`) injects ChatGPT ranking;
 * the default retriever stays lexical for deterministic unit tests.
 */
export class RagRoutingProvider implements RoutingProvider {
  private readonly cellKm: number;
  readonly roadNetwork: RoutingProvider | undefined;

  constructor(
    private readonly retriever: CorridorRetriever = new LexicalCorridorRetriever(),
    options: RagRoutingProviderOptions = {},
  ) {
    this.cellKm = options.cellKm ?? DEFAULT_CELL_KM;
    this.roadNetwork = options.roadNetwork;
  }

  async calculateRoute(
    input: ProviderRouteRequest,
    options?: RoutingProviderOptions,
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

    const corridor = composeRetrievedRoute(input.start, input.destination, path);
    if (!this.roadNetwork) {
      return corridor;
    }
    return this.snapToRoadNetwork(input, corridor, options);
  }

  private async snapToRoadNetwork(
    input: ProviderRouteRequest,
    corridor: ProviderRouteResult,
    options?: RoutingProviderOptions,
  ): Promise<ProviderRouteResult> {
    const roadNetwork = this.roadNetwork;
    if (!roadNetwork) {
      return corridor;
    }

    const sampled = sampleCorridorViaPoints(corridor.geometry);
    const attempts = uniqueWaypointAttempts([
      sampled,
      thinCorridorViaPoints(sampled, Math.ceil(sampled.length / 2)),
      thinCorridorViaPoints(sampled, Math.min(3, sampled.length)),
      input.waypoints ?? [],
      [],
    ]);

    let lastError: unknown;
    for (const waypoints of attempts) {
      try {
        return await roadNetwork.calculateRoute(
          {
            start: input.start,
            destination: input.destination,
            waypoints: waypoints.length > 0 ? waypoints : undefined,
            style: input.style,
            preferences: input.preferences,
          },
          options,
        );
      } catch (error) {
        if (!isRetryableSnapFailure(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    if (isRoutingKnowledgeError(lastError)) {
      throw lastError;
    }
    throw disconnectedKnowledgeError();
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

function isRetryableSnapFailure(error: unknown): boolean {
  return isRoutingKnowledgeError(error) && error.reason === "disconnected";
}
