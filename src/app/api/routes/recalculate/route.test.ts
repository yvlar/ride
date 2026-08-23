import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};
const WATERLOO = {
  label: "Waterloo",
  coordinates: { latitude: 45.35, longitude: -72.516 },
};

describe("POST /api/routes/recalculate (FR-026)", () => {
  it("recalculates a destination ride through the mock provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://localhost/api/routes/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPosition: GRANBY.coordinates,
          progressKm: 1,
          request: {
            type: "destination",
            start: GRANBY,
            destination: WATERLOO,
            style: "curvy",
            preferences: { avoidHighways: true, avoidUnpaved: true },
          },
          originalRoute: {
            id: "dest-1",
            type: "destination",
            start: GRANBY,
            destination: WATERLOO,
            style: "curvy",
            geometry: {
              type: "LineString",
              coordinates: [
                [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
                [WATERLOO.coordinates.longitude, WATERLOO.coordinates.latitude],
              ],
            },
            segments: [],
            steps: [],
            distanceKm: 20,
            durationMinutes: 25,
            warnings: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { route: { type: string } };
    };
    expect(payload.data.route.type).toBe("destination");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects an invalid body", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPosition: GRANBY.coordinates }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
