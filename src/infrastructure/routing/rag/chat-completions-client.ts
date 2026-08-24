import { z } from "zod";
import { CorridorRankingError } from "./corridor-ranking-error";

export const DEFAULT_OPENAI_API_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_VERCEL_AI_GATEWAY_BASE_URL =
  "https://ai-gateway.vercel.sh/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const CHAT_COMPLETIONS_TIMEOUT_MS = 8_000;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionsRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  response_format?: { type: "json_object" };
};

export interface ChatCompletionsClient {
  complete(request: ChatCompletionsRequest): Promise<string>;
}

const chatCompletionsResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

type FetchLike = typeof fetch;

export function normalizeChatApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/^Bearer\s+/i, "").trim();
  return trimmed ? trimmed : undefined;
}

export function isVercelAiGatewayKey(apiKey: string): boolean {
  return apiKey.startsWith("vck_");
}

export function isVercelAiGatewayBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "ai-gateway.vercel.sh";
  } catch {
    return false;
  }
}

export function resolveChatCompletionsBaseUrl(options: {
  apiKey: string;
  baseUrl?: string;
}): string {
  const explicit = options.baseUrl?.trim().replace(/\/+$/, "");
  if (explicit) {
    return explicit;
  }
  if (isVercelAiGatewayKey(options.apiKey)) {
    return DEFAULT_VERCEL_AI_GATEWAY_BASE_URL;
  }
  return DEFAULT_OPENAI_API_BASE_URL;
}

export function resolveChatCompletionsModel(options: {
  model?: string;
  baseUrl: string;
}): string {
  const requested = options.model?.trim() || DEFAULT_OPENAI_MODEL;
  if (isVercelAiGatewayBaseUrl(options.baseUrl) && !requested.includes("/")) {
    return `openai/${requested}`;
  }
  return requested;
}

export class HttpChatCompletionsClient implements ChatCompletionsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: {
    apiKey: string;
    baseUrl?: string;
    timeoutMs?: number;
    fetcher?: FetchLike;
  }) {
    const apiKey = normalizeChatApiKey(options.apiKey);
    if (!apiKey) {
      throw new CorridorRankingError(
        "La clé API du classement des corridors est absente. Définissez OPENAI_API_KEY côté serveur.",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = resolveChatCompletionsBaseUrl({
      apiKey,
      baseUrl: options.baseUrl,
    });
    this.timeoutMs = options.timeoutMs ?? CHAT_COMPLETIONS_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? fetch;
  }

  async complete(request: ChatCompletionsRequest): Promise<string> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0,
          response_format: request.response_format ?? { type: "json_object" },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw rankingErrorFromNetwork(error);
    }

    const payload = await readJsonPayload(response);
    if (!response.ok) {
      console.error("[ride] corridor ranking failed", {
        status: response.status,
      });
      throw rankingErrorFromHttpStatus(response.status);
    }

    const parsed = chatCompletionsResponseSchema.safeParse(payload);
    const content = parsed.success
      ? parsed.data.choices[0]?.message.content?.trim()
      : undefined;
    if (!parsed.success || !content) {
      throw new CorridorRankingError(
        "Le classement des corridors a renvoyé une réponse invalide.",
      );
    }
    return content;
  }
}

export function rankingErrorFromHttpStatus(status: number): CorridorRankingError {
  if (status === 401 || status === 403) {
    return new CorridorRankingError(
      `La clé API du classement des corridors a été refusée (HTTP ${status}).`,
    );
  }
  if (status === 402) {
    return new CorridorRankingError(
      `Le classement des corridors a atteint sa limite de crédit (HTTP ${status}).`,
    );
  }
  if (status === 429) {
    return new CorridorRankingError(
      `Le classement des corridors est temporairement limité (HTTP ${status}).`,
    );
  }
  return new CorridorRankingError(
    `Le classement des corridors a échoué (HTTP ${status}).`,
  );
}

function rankingErrorFromNetwork(error: unknown): CorridorRankingError {
  if (isTimeoutError(error)) {
    return new CorridorRankingError(
      "Le classement des corridors a dépassé le délai.",
    );
  }
  return new CorridorRankingError("Le classement des corridors a échoué.");
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  return name === "TimeoutError" || name === "AbortError";
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CorridorRankingError(
      "Le classement des corridors a renvoyé une réponse invalide.",
    );
  }
}
