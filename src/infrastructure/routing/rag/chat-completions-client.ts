import { z } from "zod";

export const DEFAULT_OPENAI_API_BASE_URL = "https://api.openai.com/v1";
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
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_OPENAI_API_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? CHAT_COMPLETIONS_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? fetch;
  }

  async complete(request: ChatCompletionsRequest): Promise<string> {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
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

    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw new Error(
        `Le classement des corridors a échoué (HTTP ${response.status}).`,
      );
    }

    const parsed = chatCompletionsResponseSchema.safeParse(payload);
    const content = parsed.success
      ? parsed.data.choices[0]?.message.content?.trim()
      : undefined;
    if (!parsed.success || !content) {
      throw new Error("Le classement des corridors a renvoyé une réponse invalide.");
    }
    return content;
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Le classement des corridors a renvoyé une réponse invalide.");
  }
}
