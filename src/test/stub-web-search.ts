export const STUB_WEB_SEARCH_HITS = [
  {
    title: "Scenic motorcycle roads",
    snippet: "Twisty paved routes popular with riders near lakes.",
  },
  {
    title: "Road work notice",
    snippet: "Seasonal closures on some private forest roads.",
  },
];

export function stubWebSearchResponse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Response | undefined {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  if (url.includes("/responses")) {
    return new Response(
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
                text: JSON.stringify({ hits: STUB_WEB_SEARCH_HITS }),
              },
            ],
          },
        ],
        output_text: JSON.stringify({ hits: STUB_WEB_SEARCH_HITS }),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  if (url.includes("/chat/completions") && usesGatewaySearchTool(init)) {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ hits: STUB_WEB_SEARCH_HITS }),
              provider_metadata: { gateway: { gatewayToolCalls: 1 } },
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  if (url.includes("api.search.brave.com")) {
    return new Response(
      JSON.stringify({
        web: {
          results: [
            {
              title: "Scenic motorcycle roads",
              description: "Twisty paved routes popular with riders.",
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  if (!url.includes("api.tavily.com")) {
    return undefined;
  }

  return new Response(
    JSON.stringify({
      results: STUB_WEB_SEARCH_HITS.map((hit) => ({
        title: hit.title,
        content: hit.snippet,
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function usesGatewaySearchTool(init?: RequestInit): boolean {
  const body = typeof init?.body === "string" ? init.body : "";
  return body.includes("vercel:exa_search");
}
