import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGeneratedRide } from "./request-generated-ride";
import type { GenerateRideRequest, GeneratedLoopRoute } from "@/domain/ride/types";

const REQUEST: GenerateRideRequest = {
  type: "loop",
  start: {
    label: "Granby",
    coordinates: { latitude: 45.403, longitude: -72.734 },
  },
  targetDistanceKm: 80,
  style: "scenic",
};

const ROUTE: GeneratedLoopRoute = {
  id: "route-1",
  type: "loop",
  start: REQUEST.start,
  targetDistanceKm: 80,
  style: "scenic",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.734, 45.403],
      [-72.7, 45.45],
    ],
  },
  segments: [],
  distanceKm: 79.2,
  durationMinutes: 84,
  statistics: { repeatedRoadPercent: 3 },
  warnings: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestGeneratedRide (FR-011)", () => {
  it("returns the single primary route from a 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { route: ROUTE },
          meta: { requestId: "req-1" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestGeneratedRide(REQUEST);

    expect(result).toEqual({ ok: true, route: ROUTE });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/routes/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(REQUEST),
      }),
    );
  });

  it("returns the explicit business error from a 422 response", async () => {
    const error = {
      code: "DISTANCE_OUT_OF_TOLERANCE",
      message: "Aucun trajet ne respecte ±10 % de 50.0 km (BR-001).",
      suggestions: ["Ajustez la distance cible."],
      bestCandidate: { distanceKm: 400 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error, meta: { requestId: "req-2" } }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await requestGeneratedRide(REQUEST);

    expect(result).toEqual({ ok: false, error });
  });

  it("returns PROVIDER_ERROR when the payload is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html></html>", { status: 500 })),
    );

    const result = await requestGeneratedRide(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("PROVIDER_ERROR");
    expect(result.error.message).toMatch(/ne répond pas/);
  });

  it("includes the knowledge flag when requested (FR-029)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { route: ROUTE },
          meta: { requestId: "req-3" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestGeneratedRide(REQUEST, { useKnowledgeRouting: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/routes/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ...REQUEST, useKnowledgeRouting: true }),
      }),
    );
  });

  it("includes AI web-generation fields for Décrire mon trajet (FR-034)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { route: ROUTE },
          meta: { requestId: "req-4" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestGeneratedRide(REQUEST, {
      useAiWebGeneration: true,
      originAccuracyMeters: 8,
      previousRouteSignature: "route-1:2:abc",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/routes/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ...REQUEST,
          useAiWebGeneration: true,
          originAccuracyMeters: 8,
          previousRouteSignature: "route-1:2:abc",
        }),
      }),
    );
  });

  it("sends returnToStart false for a one-way described ride (FR-034)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { route: ROUTE },
          meta: { requestId: "req-5" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestGeneratedRide(REQUEST, {
      useAiWebGeneration: true,
      returnToStart: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/routes/generate",
      expect.objectContaining({
        body: JSON.stringify({
          ...REQUEST,
          useAiWebGeneration: true,
          returnToStart: false,
        }),
      }),
    );
  });
});
