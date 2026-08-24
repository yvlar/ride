import { describe, expect, it, vi } from "vitest";
import {
  CHAT_COMPLETIONS_TIMEOUT_MS,
  DEFAULT_OPENAI_API_BASE_URL,
  DEFAULT_VERCEL_AI_GATEWAY_BASE_URL,
  HttpChatCompletionsClient,
  isVercelAiGatewayKey,
  resolveChatCompletionsBaseUrl,
  resolveChatCompletionsModel,
} from "./chat-completions-client";
import { CorridorRankingError } from "./corridor-ranking-error";

describe("HttpChatCompletionsClient", () => {
  it("posts JSON to /v1/chat/completions with a bearer token (FR-029)", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ranked":[]}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new HttpChatCompletionsClient({
      apiKey: "test-openai-key",
      fetcher,
    });

    const content = await client.complete({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "rank" }],
    });

    expect(content).toBe('{"ranked":[]}');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-openai-key");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      response_format: { type: string };
      temperature: number;
    };
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format.type).toBe("json_object");
    expect(body.temperature).toBe(0);
  });

  it("strips a trailing slash on the base URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "{}" } }],
        }),
        { status: 200 },
      ),
    );
    const client = new HttpChatCompletionsClient({
      apiKey: "test-openai-key",
      baseUrl: "https://example.test/v1/",
      fetcher,
    });

    await client.complete({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "rank" }],
    });

    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://example.test/v1/chat/completions",
    );
  });

  it("does not leak the API error body on HTTP failure", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { message: "sk-secret" } }), {
          status: 401,
        }),
    );
    const client = new HttpChatCompletionsClient({
      apiKey: "test-openai-key",
      fetcher,
    });

    try {
      await client.complete({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "rank" }],
      });
      throw new Error("expected HTTP failure");
    } catch (error) {
      expect(error).toBeInstanceOf(CorridorRankingError);
      expect((error as Error).message).toMatch(/refusée \(HTTP 401\)/);
      expect((error as Error).message).not.toMatch(/sk-secret/);
    }
  });

  it("keeps the chat timeout inside the route budget", () => {
    expect(CHAT_COMPLETIONS_TIMEOUT_MS).toBeLessThanOrEqual(8_000);
  });

  it("routes a Vercel AI Gateway key to the gateway base URL (FR-029)", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ranked":[]}' } }],
        }),
        { status: 200 },
      ),
    );
    const client = new HttpChatCompletionsClient({
      apiKey: "vck_test_key",
      fetcher,
    });

    await client.complete({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "rank" }],
    });

    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `${DEFAULT_VERCEL_AI_GATEWAY_BASE_URL}/chat/completions`,
    );
  });

  it("maps a network timeout without leaking internals", async () => {
    const timeout = new DOMException("The operation was aborted.", "TimeoutError");
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw timeout;
    });
    const client = new HttpChatCompletionsClient({
      apiKey: "test-openai-key",
      fetcher,
    });

    try {
      await client.complete({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "rank" }],
      });
      throw new Error("expected timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(CorridorRankingError);
      expect((error as Error).message).toMatch(/délai/);
    }
  });
});

describe("chat completions endpoint resolution (FR-029)", () => {
  it("keeps OpenAI keys on the OpenAI API", () => {
    expect(isVercelAiGatewayKey("sk-test")).toBe(false);
    expect(
      resolveChatCompletionsBaseUrl({ apiKey: "sk-test" }),
    ).toBe(DEFAULT_OPENAI_API_BASE_URL);
    expect(
      resolveChatCompletionsModel({
        model: "gpt-4o-mini",
        baseUrl: DEFAULT_OPENAI_API_BASE_URL,
      }),
    ).toBe("gpt-4o-mini");
  });

  it("sends Vercel AI Gateway keys to ChatGPT through the gateway", () => {
    expect(isVercelAiGatewayKey("vck_test_key")).toBe(true);
    expect(
      resolveChatCompletionsBaseUrl({ apiKey: "vck_test_key" }),
    ).toBe(DEFAULT_VERCEL_AI_GATEWAY_BASE_URL);
    expect(
      resolveChatCompletionsModel({
        model: "gpt-4o-mini",
        baseUrl: DEFAULT_VERCEL_AI_GATEWAY_BASE_URL,
      }),
    ).toBe("openai/gpt-4o-mini");
  });

  it("honors an explicit base URL over the key prefix", () => {
    expect(
      resolveChatCompletionsBaseUrl({
        apiKey: "vck_test_key",
        baseUrl: "https://example.test/v1/",
      }),
    ).toBe("https://example.test/v1");
  });
});
