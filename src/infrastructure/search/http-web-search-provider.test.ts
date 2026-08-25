import { describe, expect, it, vi } from "vitest";
import {
  HttpWebSearchProvider,
  motorcycleSearchQueries,
} from "./http-web-search-provider";
import { WebSearchError } from "./web-search-error";

const ORIGIN = { latitude: 45.4, longitude: -72.73 };

describe("HttpWebSearchProvider (FR-034)", () => {
  it("calls the search service and returns titles and snippets only", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Eastern Townships motorcycle loop",
              content: "Twisty scenic roads near Orford.",
              url: "https://example.invalid/secret",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new HttpWebSearchProvider({
      provider: "tavily",
      apiKey: "test-web-search-key",
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
    expect(fetcher).toHaveBeenCalled();
    expect(JSON.stringify(hits)).not.toMatch(/example\.invalid/);
  });

  it("fails clearly when the search service is unavailable", async () => {
    const provider = new HttpWebSearchProvider({
      provider: "tavily",
      apiKey: "test-web-search-key",
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

  it("keeps search queries on the server", () => {
    const queries = motorcycleSearchQueries({
      origin: ORIGIN,
      accuracyMeters: 8,
      targetDistanceKm: 180,
      preferences: { avoidHighways: true, avoidUnpaved: true },
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.join(" ")).toMatch(/motorcycle/);
    expect(queries.join(" ")).toMatch(/45\.4000/);
  });

  it("searches for the requested shape and every hard route preference", () => {
    const queries = motorcycleSearchQueries({
      origin: ORIGIN,
      accuracyMeters: 8,
      targetDistanceKm: 180,
      style: "curvy",
      returnToStart: false,
      preferences: {
        avoidHighways: true,
        avoidUnpaved: true,
        stayInCanada: true,
      },
    });
    const combined = queries.join(" ");

    expect(queries).toHaveLength(3);
    expect(combined).toMatch(/180 km one-way ride/);
    expect(combined).not.toMatch(/180 km loop/);
    expect(combined).toMatch(/within 198 km/);
    expect(combined).toMatch(/avoid highways and freeways/);
    expect(combined).toMatch(/paved roads only/);
    expect(combined).toMatch(/stay in Canada/);
    expect(combined).toMatch(/do not cross into the United States/);
  });
});
