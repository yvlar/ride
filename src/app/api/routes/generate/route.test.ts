import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function fetchUrl(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  if (typeof input === "object" && input !== null && "url" in input) {
    return String((input as { url: unknown }).url);
  }
  return String(input);
}

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

const TREMBLANT = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

describe("POST /api/routes/generate", () => {
  it("returns a loop route for a valid FR-001 request", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "loop",
          start: GRANBY,
          targetDistanceKm: 80,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { route: { type: string; distanceKm: number } };
      meta: { requestId: string };
    };
    expect(payload.data.route.type).toBe("loop");
    expect(payload.data.route.distanceKm).toBeGreaterThan(70);
    expect(payload.data.route.distanceKm).toBeLessThan(90);
    expect(payload.meta.requestId).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("returns a destination route for a valid FR-002 request", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "destination",
          start: GRANBY,
          destination: TREMBLANT,
          style: "curvy",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { route: { type: string; destination: { label: string } } };
    };
    expect(payload.data.route.type).toBe("destination");
    expect(payload.data.route.destination.label).toBe("Mont-Tremblant");
  });

  it("rejects a destination request missing the destination place (FR-002)", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "destination",
          start: GRANBY,
          style: "curvy",
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a destination request missing the driving style (FR-002)", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "destination",
          start: GRANBY,
          destination: TREMBLANT,
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a round-trip route for a valid FR-003 request", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "round_trip",
          start: GRANBY,
          destination: TREMBLANT,
          style: "curvy",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        route: {
          type: string;
          destination: { label: string };
          statistics: { outboundReturnOverlapPercent: number };
        };
      };
    };
    expect(payload.data.route.type).toBe("round_trip");
    expect(payload.data.route.destination.label).toBe("Mont-Tremblant");
    expect(
      payload.data.route.statistics.outboundReturnOverlapPercent,
    ).toBeGreaterThanOrEqual(0);
  });

  it("returns a single primary route rather than variants (FR-011)", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "loop",
          start: GRANBY,
          targetDistanceKm: 80,
          style: "scenic",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        route: { type: string; distanceKm: number; durationMinutes: number };
        variants?: unknown;
      };
    };
    expect(payload.data.route.type).toBe("loop");
    expect(payload.data.route.distanceKm).toBeGreaterThan(0);
    expect(payload.data.route.durationMinutes).toBeGreaterThan(0);
    expect(payload.data.variants).toBeUndefined();
    expect(Array.isArray(payload.data.route)).toBe(false);
  });

  it("returns an explicit business error when the request is invalid (FR-011)", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "loop",
          start: GRANBY,
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: { code: string; message: string; suggestions: string[] };
    };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.message.length).toBeGreaterThan(0);
    expect(payload.error.suggestions.length).toBeGreaterThan(0);
  });

  it("rejects an oversized body without invoking generation", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "40000",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });

  it("uses knowledge corridors when useKnowledgeRouting is true (FR-029)", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "loop",
          start: GRANBY,
          targetDistanceKm: 80,
          style: "scenic",
          useKnowledgeRouting: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { route: { segments: { roadName?: string }[] } };
    };
    expect(
      payload.data.route.segments.some(
        (segment) => segment.roadName && !segment.roadName.startsWith("Grid "),
      ),
    ).toBe(true);
  });

  it("generates a described loop through AI and web search (FR-034)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const response = await POST(
        new Request("http://localhost/api/routes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "loop",
            start: GRANBY,
            targetDistanceKm: 80,
            style: "scenic",
            useAiWebGeneration: true,
            originAccuracyMeters: 8,
          }),
        }),
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: { route: { type: string; geometry: { coordinates: unknown[] } } };
      };
      expect(payload.data.route.type).toBe("loop");
      expect(
        payload.data.route.geometry.coordinates.length,
      ).toBeGreaterThanOrEqual(8);
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toMatch(/DESCRIBE_LOOP_PLAN/);
      expect(serialized).not.toMatch(/searchHits/);
      expect(serialized).not.toMatch(/test-web-search-key/);
      expect(serialized).not.toMatch(/motorcycle scenic twisty/);
      const urls = fetchSpy.mock.calls.map(([input]) => fetchUrl(input));
      expect(urls.some((url) => url.includes("api.tavily.com"))).toBe(true);
      expect(urls.some((url) => url.includes("/responses"))).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("uses OPENAI_API_KEY for web search when WEB_SEARCH_API_KEY is absent (FR-034)", async () => {
    const previousKey = process.env.WEB_SEARCH_API_KEY;
    const previousProvider = process.env.WEB_SEARCH_PROVIDER;
    delete process.env.WEB_SEARCH_API_KEY;
    delete process.env.WEB_SEARCH_PROVIDER;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const response = await POST(
        new Request("http://localhost/api/routes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "loop",
            start: GRANBY,
            targetDistanceKm: 80,
            style: "scenic",
            useAiWebGeneration: true,
            originAccuracyMeters: 8,
          }),
        }),
      );

      expect(response.status).toBe(200);
      const urls = fetchSpy.mock.calls.map(([input]) => fetchUrl(input));
      expect(urls.some((url) => url.includes("/responses"))).toBe(true);
      expect(urls.some((url) => url.includes("api.tavily.com"))).toBe(false);
    } finally {
      if (previousKey === undefined) {
        delete process.env.WEB_SEARCH_API_KEY;
      } else {
        process.env.WEB_SEARCH_API_KEY = previousKey;
      }
      if (previousProvider === undefined) {
        delete process.env.WEB_SEARCH_PROVIDER;
      } else {
        process.env.WEB_SEARCH_PROVIDER = previousProvider;
      }
      fetchSpy.mockRestore();
    }
  });
});
