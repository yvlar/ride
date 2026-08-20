import { describe, expect, it } from "vitest";
import { POST } from "./route";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

describe("POST /api/routes/generate (FR-001)", () => {
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
  });

  it("rejects a later ride type instead of implementing it", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "destination",
          start: GRANBY,
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: { code: string };
    };
    expect(payload.error.code).toBe("UNSUPPORTED_RIDE_TYPE");
  });
});
