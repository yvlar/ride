import { z } from "zod";
import { isSpatiallyRelevant } from "./retrieve";
import { DEFAULT_OPENAI_MODEL, type ChatCompletionsClient } from "./chat-completions-client";
import { CorridorRankingError } from "./corridor-ranking-error";
import type {
  CorridorRetriever,
  RetrievedCorridor,
  RetrievalInput,
  RouteKnowledgeDocument,
} from "./types";

export const CHAT_RANKING_QUERY_HEADER = "QUERY:";
export const CHAT_RANKING_KINDS_HEADER = "KINDS:";

export type CorridorKind = {
  key: string;
  roadName: string;
  roadClass: string;
  surface: string;
  text: string;
};

const rankingSchema = z.object({
  ranked: z
    .array(
      z.object({
        key: z.string().min(1),
        score: z.number().finite(),
      }),
    )
    .optional(),
});

const SYSTEM_PROMPT =
  "You rank motorcycle road corridor kinds. Return JSON " +
  '{"ranked":[{"key":"<kind key>","score":<number from 0 to 1>}]}. ' +
  "Use only the provided keys. Prefer kinds matching the query " +
  "(scenic, curvy, touring, fastest, paved). Do not invent coordinates, roads, or keys.";

export function corridorKindKey(document: RouteKnowledgeDocument): string {
  return `${document.roadName}|${document.roadClass}|${document.surface}`;
}

export function uniqueCorridorKinds(
  documents: RouteKnowledgeDocument[],
): CorridorKind[] {
  const seen = new Map<string, CorridorKind>();
  for (const document of documents) {
    const key = corridorKindKey(document);
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        roadName: document.roadName,
        roadClass: document.roadClass,
        surface: document.surface,
        text: document.text,
      });
    }
  }
  return [...seen.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function buildChatRankingUserMessage(
  query: string,
  kinds: CorridorKind[],
): string {
  return `${CHAT_RANKING_QUERY_HEADER}\n${query}\n\n${CHAT_RANKING_KINDS_HEADER}\n${JSON.stringify(kinds)}`;
}

export function parseJsonObjectContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        throw new CorridorRankingError(
          "Le classement des corridors a renvoyé une réponse invalide.",
        );
      }
    }
    throw new CorridorRankingError(
      "Le classement des corridors a renvoyé une réponse invalide.",
    );
  }
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(1, Math.max(0, score));
}

/**
 * NFR-005 / FR-029 — ChatGPT ranks local corridor kinds; it does not emit
 * geometry. Unknown keys are ignored. Unranked kinds keep score 0 so the
 * retrieved graph stays connected.
 */
export class ChatGptCorridorRetriever implements CorridorRetriever {
  private readonly client: ChatCompletionsClient;
  private readonly model: string;
  private readonly scoreCache = new Map<string, Map<string, number>>();
  private readonly inflight = new Map<string, Promise<Map<string, number>>>();

  constructor(options: { client: ChatCompletionsClient; model?: string }) {
    this.client = options.client;
    this.model = options.model ?? DEFAULT_OPENAI_MODEL;
  }

  async retrieve(input: RetrievalInput): Promise<RetrievedCorridor[]> {
    const nearby = input.documents.filter((document) =>
      isSpatiallyRelevant(document, input.stops),
    );
    if (nearby.length === 0) {
      return [];
    }

    const kinds = uniqueCorridorKinds(nearby);
    const cacheKey = `${input.query}\n${kinds.map((kind) => kind.key).join("\n")}`;
    const scores = await this.scoresFor(cacheKey, input.query, kinds);

    return nearby
      .map((document) => ({
        document,
        score: scores.get(corridorKindKey(document)) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.document.id.localeCompare(right.document.id),
      );
  }

  private async scoresFor(
    cacheKey: string,
    query: string,
    kinds: CorridorKind[],
  ): Promise<Map<string, number>> {
    const cached = this.scoreCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = this.inflight.get(cacheKey);
    if (pending) {
      return pending;
    }

    const request = this.rankKinds(query, kinds).finally(() => {
      this.inflight.delete(cacheKey);
    });
    this.inflight.set(cacheKey, request);
    const scores = await request;
    this.scoreCache.set(cacheKey, scores);
    return scores;
  }

  private async rankKinds(
    query: string,
    kinds: CorridorKind[],
  ): Promise<Map<string, number>> {
    const allowed = new Set(kinds.map((kind) => kind.key));
    const content = await this.client.complete({
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildChatRankingUserMessage(query, kinds) },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const parsed = rankingSchema.safeParse(parseJsonObjectContent(content));
    if (!parsed.success) {
      throw new CorridorRankingError(
      "Le classement des corridors a renvoyé une réponse invalide.",
    );
    }

    const scores = new Map<string, number>();
    for (const entry of parsed.data.ranked ?? []) {
      if (!allowed.has(entry.key)) {
        continue;
      }
      scores.set(entry.key, clampScore(entry.score));
    }
    return scores;
  }
}
