import { z } from "zod";
import {
  isVercelAiGatewayBaseUrl,
  resolveChatCompletionsBaseUrl,
  resolveChatCompletionsModel,
} from "@/infrastructure/routing/rag/chat-completions-client";
import {
  motorcycleSearchQueries,
  uniqueHits,
  WEB_SEARCH_INVALID_MESSAGE,
  WEB_SEARCH_MISSING_KEY_MESSAGE,
  WEB_SEARCH_TIMEOUT_MESSAGE,
  WEB_SEARCH_UNAVAILABLE_MESSAGE,
} from "./http-web-search-provider";
import { WebSearchError } from "./web-search-error";
import type {
  MotorcycleWebSearchInput,
  WebSearchHit,
  WebSearchProvider,
} from "./web-search-provider";

export const OPENAI_WEB_SEARCH_TIMEOUT_MS = 20_000;
export const OPENAI_WEB_SEARCH_PROMPT_HEADER = "DESCRIBE_WEB_SEARCH:";

const jsonHitsSchema = z.object({
  hits: z
    .array(
      z.object({
        title: z.string().optional(),
        snippet: z.string().optional(),
      }),
    )
    .optional(),
});

const responsesSchema = z.object({
  output: z.array(z.unknown()).optional(),
  output_text: z.string().optional(),
});

const chatSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            content: z.string().nullable().optional(),
            provider_metadata: z
              .object({
                gateway: z
                  .object({
                    gatewayToolCalls: z.number().optional(),
                  })
                  .optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

type FetchLike = typeof fetch;

/**
 * FR-034 / NFR-005 — web search via the server chat key when Tavily/Brave
 * is not configured. OpenAI keys use Responses `web_search`; Vercel AI
 * Gateway keys use the hosted Exa server tool.
 */
export class OpenAiWebSearchProvider implements WebSearchProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    fetcher?: FetchLike;
  }) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new WebSearchError(WEB_SEARCH_MISSING_KEY_MESSAGE);
    }
    this.apiKey = apiKey;
    this.baseUrl = resolveChatCompletionsBaseUrl({
      apiKey,
      baseUrl: options.baseUrl,
    });
    this.model = resolveChatCompletionsModel({
      model: options.model,
      baseUrl: this.baseUrl,
    });
    this.timeoutMs = options.timeoutMs ?? OPENAI_WEB_SEARCH_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? fetch;
  }

  async searchMotorcycleRoads(
    input: MotorcycleWebSearchInput,
  ): Promise<WebSearchHit[]> {
    const queries = motorcycleSearchQueries(input);
    const hits = isVercelAiGatewayBaseUrl(this.baseUrl)
      ? await this.searchViaGateway(queries)
      : await this.searchViaResponses(queries);
    const unique = uniqueHits(hits.map(sanitizeHit).filter(hasText));
    if (unique.length === 0) {
      throw new WebSearchError(WEB_SEARCH_UNAVAILABLE_MESSAGE);
    }
    return unique;
  }

  private async searchViaResponses(queries: string[]): Promise<WebSearchHit[]> {
    const payload = await this.request(`${this.baseUrl}/responses`, {
      model: this.model,
      tools: [
        {
          type: "web_search",
          search_context_size: "medium",
        },
      ],
      tool_choice: "required",
      input: buildWebSearchUserMessage(queries),
    });
    const parsed = responsesSchema.safeParse(payload);
    if (!parsed.success) {
      throw new WebSearchError(WEB_SEARCH_INVALID_MESSAGE);
    }
    if (!outputDidSearch(parsed.data.output)) {
      throw new WebSearchError(WEB_SEARCH_UNAVAILABLE_MESSAGE);
    }
    return hitsFromResponses(parsed.data);
  }

  private async searchViaGateway(queries: string[]): Promise<WebSearchHit[]> {
    const payload = await this.request(`${this.baseUrl}/chat/completions`, {
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "You extract motorcycle road notes from web search. " +
            'Return JSON {"hits":[{"title":"<short title>","snippet":"<factual note>"}]}. ' +
            "Do not include URLs, coordinates, GeoJSON, or route geometry.",
        },
        {
          role: "user",
          content: buildWebSearchUserMessage(queries),
        },
      ],
      tools: [
        {
          type: "vercel:exa_search",
          config: {
            query: queries.join(" | "),
            type: "fast",
            num_results: 8,
          },
        },
      ],
      tool_choice: "required",
      temperature: 0,
    });
    const parsed = chatSchema.safeParse(payload);
    const content = parsed.success
      ? parsed.data.choices?.[0]?.message?.content?.trim()
      : undefined;
    const toolCalls =
      parsed.success
        ? parsed.data.choices?.[0]?.message?.provider_metadata?.gateway
            ?.gatewayToolCalls
        : undefined;
    if (!parsed.success || !content) {
      throw new WebSearchError(WEB_SEARCH_INVALID_MESSAGE);
    }
    if (typeof toolCalls !== "number" || toolCalls < 1) {
      throw new WebSearchError(WEB_SEARCH_UNAVAILABLE_MESSAGE);
    }
    return hitsFromText(content);
  }

  private async request(url: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new WebSearchError(WEB_SEARCH_TIMEOUT_MESSAGE);
      }
      throw new WebSearchError(WEB_SEARCH_UNAVAILABLE_MESSAGE);
    }

    const payload = await readJson(response);
    if (!response.ok) {
      console.error("[ride] web search failed", { status: response.status });
      throw new WebSearchError(WEB_SEARCH_UNAVAILABLE_MESSAGE);
    }
    return payload;
  }
}

export function buildWebSearchUserMessage(queries: string[]): string {
  return `${OPENAI_WEB_SEARCH_PROMPT_HEADER}\n${JSON.stringify({
    task: "Find public motorcycle scenic or twisty roads, points of interest, closures, and roads to avoid.",
    queries,
    output:
      'JSON {"hits":[{"title":"short title","snippet":"factual note without URLs"}]}',
  })}`;
}

function outputDidSearch(output: unknown[] | undefined): boolean {
  if (!output) {
    return false;
  }
  return output.some((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const record = item as { type?: unknown; status?: unknown };
    return record.type === "web_search_call" && record.status === "completed";
  });
}

function hitsFromResponses(payload: {
  output?: unknown[];
  output_text?: string;
}): WebSearchHit[] {
  const fromJson = hitsFromText(payload.output_text ?? "");
  if (fromJson.length > 0) {
    return fromJson;
  }
  const fromOutput = hitsFromOutputItems(payload.output ?? []);
  if (fromOutput.length > 0) {
    return fromOutput;
  }
  const text = collectOutputText(payload.output ?? []).trim();
  if (text) {
    return [{ title: "Notes de recherche Web", snippet: stripUrls(text) }];
  }
  return [];
}

function hitsFromOutputItems(output: unknown[]): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as {
      type?: unknown;
      action?: { sources?: unknown };
      content?: unknown;
    };
    if (record.type === "web_search_call") {
      const sources = Array.isArray(record.action?.sources)
        ? record.action.sources
        : [];
      for (const source of sources) {
        if (typeof source !== "object" || source === null) {
          continue;
        }
        const title = (source as { title?: unknown }).title;
        if (typeof title === "string" && title.trim()) {
          hits.push({ title: title.trim(), snippet: "" });
        }
      }
    }
    if (record.type === "message" && Array.isArray(record.content)) {
      for (const block of record.content) {
        if (typeof block !== "object" || block === null) {
          continue;
        }
        const text = (block as { text?: unknown }).text;
        if (typeof text === "string") {
          hits.push(...hitsFromText(text));
        }
        const annotations = (block as { annotations?: unknown }).annotations;
        if (!Array.isArray(annotations)) {
          continue;
        }
        for (const annotation of annotations) {
          if (typeof annotation !== "object" || annotation === null) {
            continue;
          }
          const title = (annotation as { title?: unknown }).title;
          if (typeof title === "string" && title.trim()) {
            hits.push({ title: title.trim(), snippet: "" });
          }
        }
      }
    }
  }
  return hits;
}

function collectOutputText(output: unknown[]): string {
  const parts: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") {
        parts.push(text);
      }
    }
  }
  return parts.join("\n");
}

function hitsFromText(content: string): WebSearchHit[] {
  const parsed = parseJsonObject(content);
  const hits = jsonHitsSchema.safeParse(parsed);
  if (!hits.success) {
    return [];
  }
  return (hits.data.hits ?? [])
    .map((hit) => ({
      title: hit.title?.trim() ?? "",
      snippet: hit.snippet?.trim() ?? "",
    }))
    .filter(hasText);
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return null;
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

function sanitizeHit(hit: WebSearchHit): WebSearchHit {
  return {
    title: stripUrls(hit.title).slice(0, 200),
    snippet: stripUrls(hit.snippet).slice(0, 500),
  };
}

function hasText(hit: WebSearchHit): boolean {
  return Boolean(hit.title || hit.snippet);
}

function stripUrls(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new WebSearchError(WEB_SEARCH_INVALID_MESSAGE);
  }
}
