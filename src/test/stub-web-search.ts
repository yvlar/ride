export function stubWebSearchResponse(
  input: RequestInfo | URL,
): Response | undefined {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

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
      results: [
        {
          title: "Scenic motorcycle roads",
          content: "Twisty paved routes popular with riders near lakes.",
        },
        {
          title: "Road work notice",
          content: "Seasonal closures on some private forest roads.",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
