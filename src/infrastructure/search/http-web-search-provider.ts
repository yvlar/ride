import { z } from "zod";
import { WebSearchError } from "./web-search-error";
import type {
  MotorcycleWebSearchInput,
  WebSearchHit,
  WebSearchProvider,
} from "./web-search-provider";

export const DEFAULT_TAVILY_API_BASE_URL = "https://api.tavily.com";
export const WEB_SEARCH_TIMEOUT_MS = 10_000;

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        snippet: z.string().optional(),
      }),
    )
    .optional(),
});

const braveResponseSchema = z.object({
  web: z
    .object({
      results: z
        .array(
          z.object({
            title: z.string().optional(),
            description: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

type FetchLike = typeof fetch;

export type HttpWebSearchProviderOptions = {
  provider: "tavily" | "brave";
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
};

/**
 * FR-034 — server-only web search. Queries never leave this adapter toward
 * the client.
 */
export class HttpWebSearchProvider implements WebSearchProvider {
  private readonly provider: "tavily" | "brave";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: HttpWebSearchProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new WebSearchError(WEB_SEARCH_MISSING_KEY_MESSAGE);
    }
    this.provider = options.provider;
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl?.trim() || defaultBaseUrl(options.provider)).replace(
      /\/+$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? WEB_SEARCH_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? fetch;
  }

  async searchMotorcycleRoads(
    input: MotorcycleWebSearchInput,
  ): Promise<WebSearchHit[]> {
    const queries = motorcycleSearchQueries(input);
    const pages = await Promise.all(
      queries.map((query) => this.searchQuery(query)),
    );
    return uniqueHits(pages.flat());
  }

  private async searchQuery(query: string): Promise<WebSearchHit[]> {
    if (this.provider === "brave") {
      return this.searchBrave(query);
    }
    return this.searchTavily(query);
  }

  private async searchTavily(query: string): Promise<WebSearchHit[]> {
    const response = await this.request(`${this.baseUrl}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        search_depth: "basic",
        max_results: 6,
        include_answer: false,
      }),
    });
    const parsed = tavilyResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new WebSearchError(WEB_SEARCH_INVALID_MESSAGE);
    }
    return (parsed.data.results ?? [])
      .map((result) => ({
        title: result.title?.trim() ?? "",
        snippet: (result.content ?? result.snippet ?? "").trim(),
      }))
      .filter((hit) => hit.title || hit.snippet);
  }

  private async searchBrave(query: string): Promise<WebSearchHit[]> {
    const url = new URL(`${this.baseUrl}/res/v1/web/search`);
    url.searchParams.set("q", query);
    const response = await this.request(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey,
      },
    });
    const parsed = braveResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new WebSearchError(WEB_SEARCH_INVALID_MESSAGE);
    }
    return (parsed.data.web?.results ?? [])
      .map((result) => ({
        title: result.title?.trim() ?? "",
        snippet: result.description?.trim() ?? "",
      }))
      .filter((hit) => hit.title || hit.snippet);
  }

  private async request(
    url: string,
    init: RequestInit,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
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
      throw new WebSearchError(WEB_SEARCH_UNAVAILABLE_MESSAGE);
    }
    return payload;
  }
}

export const WEB_SEARCH_MISSING_KEY_MESSAGE =
  "La recherche Web est indisponible.";
export const WEB_SEARCH_UNAVAILABLE_MESSAGE =
  "La recherche Web est indisponible.";
export const WEB_SEARCH_TIMEOUT_MESSAGE =
  "La recherche Web est indisponible.";
export const WEB_SEARCH_INVALID_MESSAGE =
  "La recherche Web est indisponible.";

export function motorcycleSearchQueries(
  input: MotorcycleWebSearchInput,
): string[] {
  const point = `latitude ${input.origin.latitude.toFixed(4)} longitude ${input.origin.longitude.toFixed(4)}`;
  const style = input.style ?? "scenic";
  const returnToStart = input.returnToStart !== false;
  const searchRadiusKm = Math.max(
    10,
    Math.round(
      input.targetDistanceKm * (returnToStart ? 0.55 : 1.1),
    ),
  );
  const rideKind = returnToStart
    ? `${input.targetDistanceKm} km loop`
    : `${input.targetDistanceKm} km one-way ride`;
  const preferences = [
    input.preferences?.avoidHighways ? "avoid highways and freeways" : "",
    input.preferences?.avoidUnpaved ? "paved roads only" : "",
    input.preferences?.stayInCanada
      ? "stay in Canada and do not cross into the United States"
      : "",
  ].filter(Boolean);
  const preferenceQuery =
    preferences.length > 0 ? ` ${preferences.join(" ")}` : "";
  return [
    `best ${style} scenic twisty motorcycle roads for a ${rideKind} starting near ${point} within ${searchRadiusKm} km${preferenceQuery}`,
    `motorcycle route guides named roads viewpoints and towns near ${point} within ${searchRadiusKm} km for a ${rideKind}${preferenceQuery}`,
    `current motorcycle road closures construction detours seasonal private and unpaved roads near ${point} within ${searchRadiusKm} km${preferenceQuery}`,
  ];
}

function defaultBaseUrl(provider: "tavily" | "brave"): string {
  return provider === "brave"
    ? "https://api.search.brave.com"
    : DEFAULT_TAVILY_API_BASE_URL;
}

export function uniqueHits(hits: WebSearchHit[]): WebSearchHit[] {
  const seen = new Set<string>();
  const unique: WebSearchHit[] = [];
  for (const hit of hits) {
    const key = `${hit.title}\n${hit.snippet}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(hit);
  }
  return unique;
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
