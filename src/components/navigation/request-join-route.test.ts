import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJoinRoute } from "./request-join-route";

describe("requestJoinRoute (FR-039)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts only the GPS point and GPX entry", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            route: {
              geometry: {
                type: "LineString",
                coordinates: [
                  [-72.73, 45.4],
                  [-72.7, 45.4],
                ],
              },
              segments: [],
              distanceKm: 2,
              durationMinutes: 3,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await requestJoinRoute({
      start: { latitude: 45.4, longitude: -72.73 },
      destination: { latitude: 45.4, longitude: -72.7 },
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/routes/join",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
