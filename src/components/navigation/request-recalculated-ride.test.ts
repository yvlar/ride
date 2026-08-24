import { afterEach, describe, expect, it, vi } from "vitest";
import { requestRecalculatedRide } from "./request-recalculated-ride";
import type { GenerateRideRequest, GeneratedDestinationRoute } from "@/domain/ride/types";

const REQUEST: GenerateRideRequest = {
  type: "destination",
  start: {
    label: "Granby",
    coordinates: { latitude: 45.403, longitude: -72.734 },
  },
  destination: {
    label: "Waterloo",
    coordinates: { latitude: 45.35, longitude: -72.516 },
  },
  style: "curvy",
  preferences: { avoidHighways: false, avoidUnpaved: false },
};

const ROUTE: GeneratedDestinationRoute = {
  id: "dest-1",
  type: "destination",
  start: REQUEST.start,
  destination: REQUEST.destination,
  style: "curvy",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.734, 45.403],
      [-72.516, 45.35],
    ],
  },
  segments: [],
  distanceKm: 20,
  durationMinutes: 25,
  warnings: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestRecalculatedRide (FR-026, FR-029)", () => {
  it("puts the knowledge flag on the nested request", async () => {
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

    await requestRecalculatedRide({
      currentPosition: REQUEST.start.coordinates,
      progressKm: 2,
      request: REQUEST,
      originalRoute: ROUTE,
      useKnowledgeRouting: true,
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    ) as { request: { useKnowledgeRouting?: boolean } };
    expect(body.request.useKnowledgeRouting).toBe(true);
  });
});
