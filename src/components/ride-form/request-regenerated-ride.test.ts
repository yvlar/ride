import { afterEach, describe, expect, it, vi } from "vitest";
import { requestRegeneratedRide } from "./request-regenerated-ride";
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

const VARIANT: GeneratedLoopRoute = {
  ...ROUTE,
  id: "route-2",
  distanceKm: 82.1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestRegeneratedRide (FR-012, FR-034)", () => {
  it("sends the previous ride type with the corridor geometry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { route: VARIANT },
          meta: { requestId: "req-1" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestRegeneratedRide(REQUEST, ROUTE);

    expect(result).toEqual({ ok: true, route: VARIANT });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/routes/regenerate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          request: REQUEST,
          previousRoute: {
            type: ROUTE.type,
            geometry: ROUTE.geometry,
          },
        }),
      }),
    );
  });
});
