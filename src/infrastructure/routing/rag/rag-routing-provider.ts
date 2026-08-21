import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";
import { composeRetrievedRoute } from "./compose";
import { buildRouteRetrievalQuery, LexicalCorridorRetriever } from "./retrieve";
import type { CorridorRetriever } from "./types";

const DEFAULT_RETRIEVAL_LIMIT = 5;

/**
 * NFR-005 / BR-004 — RAG routing adapter.
 * Retrieve known motorcycle corridors, then generate a path using only those
 * documents. The domain never imports this module.
 */
export class RagRoutingProvider implements RoutingProvider {
  constructor(
    private readonly retriever: CorridorRetriever = new LexicalCorridorRetriever(),
    private readonly retrievalLimit = DEFAULT_RETRIEVAL_LIMIT,
  ) {}

  async calculateRoute(
    input: ProviderRouteRequest,
  ): Promise<ProviderRouteResult> {
    const query = buildRouteRetrievalQuery(input);
    const retrieved = await this.retriever.retrieve(query, this.retrievalLimit);
    return composeRetrievedRoute(input, retrieved);
  }
}
