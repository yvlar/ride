import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VERCEL_AI_GATEWAY_BASE_URL } from "@/infrastructure/routing/rag/chat-completions-client";
import {
  buildWebSearchUserMessage,
  OPENAI_WEB_SEARCH_PROMPT_HEADER,
  OpenAiWebSearchProvider,
} from "./openai-web-search-provider";
import { WebSearchError } from "./web-search-error";

const ORIGIN = { latitude: 45.4, longitude: -72.73 };

describe("OpenAiWebSearchProvider (FR-034)", () => {
  it("calls Responses web_search for an OpenAI key and keeps URLs off hits", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          output: [
            {
              type: "web_search_call",
              status: "completed",
              action: { type: "search", query: "motorcycle" },
            },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    hits: [
                      {
                        title: "Eastern Townships motorcycle loop",
                        snippet: "Twisty scenic roads near Orford.",
                      },
                    ],
                  }),
                  annotations: [
                    {
                      type: "url_citation",
                      url: "https://example.invalid/secret",
                      title: "Secret page",
                    },
                  ],
                },
              ],
            },
          ],
          output_text: JSON.stringify({
            hits: [
              {
                title: "Eastern Townships motorcycle loop",
                snippet: "Twisty scenic roads near Orford. https://example.invalid/secret",
              },
            ],
          }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new OpenAiWebSearchProvider({
      apiKey: "test-openai-key",
      fetcher,
    });

    const hits = await provider.searchMotorcycleRoads({
      origin: ORIGIN,
      accuracyMeters: 8,
      targetDistanceKm: 100,
      style: "scenic",
      preferences: { avoidHighways: true, avoidUnpaved: true },
    });

    expect(hits).toEqual([
      {
        title: "Eastern Townships motorcycle loop",
        snippet: "Twisty scenic roads near Orford.",
      },
    ]);
    expect(JSON.stringify(hits)).not.toMatch(/example\.invalid/);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body)) as {
      tools: { type: string }[];
      tool_choice: string;
      input: string;
    };
    expect(body.tools[0]?.type).toBe("web_search");
    expect(body.tool_choice).toBe("required");
    expect(body.input).toContain(OPENAI_WEB_SEARCH_PROMPT_HEADER);
    expect(body.input).toMatch(/45\.4000/);
  });

  it("uses the Gateway Exa server tool for a vck_ key", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  hits: [
                    {
                      title: "Scenic motorcycle roads",
                      snippet: "Twisty paved routes popular with riders.",
                    },
                  ],
                }),
                provider_metadata: { gateway: { gatewayToolCalls: 1 } },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiWebSearchProvider({
      apiKey: "vck_test_key",
      fetcher,
    });

    const hits = await provider.searchMotorcycleRoads({
      origin: ORIGIN,
      accuracyMeters: null,
      targetDistanceKm: 80,
    });

    expect(hits[0]?.title).toBe("Scenic motorcycle roads");
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      `${DEFAULT_VERCEL_AI_GATEWAY_BASE_URL}/chat/completions`,
    );
    const body = JSON.parse(String(init?.body)) as {
      tools: { type: string; config?: { query?: string } }[];
      tool_choice: string;
    };
    expect(body.tools[0]?.type).toBe("vercel:exa_search");
    expect(body.tools[0]?.config?.query).toMatch(/motorcycle/);
    expect(body.tool_choice).toBe("required");
  });

  it("fails clearly when the search service is unavailable", async () => {
    const provider = new OpenAiWebSearchProvider({
      apiKey: "test-openai-key",
      fetcher: async () => {
        throw new Error("network");
      },
    });

    await expect(
      provider.searchMotorcycleRoads({
        origin: ORIGIN,
        accuracyMeters: null,
        targetDistanceKm: 80,
      }),
    ).rejects.toBeInstanceOf(WebSearchError);
  });

  it("fails when Responses did not actually search", async () => {
    const provider = new OpenAiWebSearchProvider({
      apiKey: "test-openai-key",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: '{"hits":[]}' }],
              },
            ],
          }),
          { status: 200 },
        ),
    });

    await expect(
      provider.searchMotorcycleRoads({
        origin: ORIGIN,
        accuracyMeters: null,
        targetDistanceKm: 80,
      }),
    ).rejects.toBeInstanceOf(WebSearchError);
  });

  it("keeps the search prompt on the server", () => {
    const message = buildWebSearchUserMessage([
      "motorcycle scenic twisty roads near 45.4000,-72.7300 180 km loop",
    ]);
    expect(message).toContain(OPENAI_WEB_SEARCH_PROMPT_HEADER);
    expect(message).toMatch(/motorcycle/);
  });
});
