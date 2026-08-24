import { describe, expect, it, vi } from "vitest";
import {
  CHAT_COMPLETIONS_TIMEOUT_MS,
  HttpChatCompletionsClient,
} from "./chat-completions-client";

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
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/HTTP 401/);
      expect((error as Error).message).not.toMatch(/sk-secret/);
    }
  });

  it("keeps the chat timeout inside the route budget", () => {
    expect(CHAT_COMPLETIONS_TIMEOUT_MS).toBeLessThanOrEqual(8_000);
  });
});
