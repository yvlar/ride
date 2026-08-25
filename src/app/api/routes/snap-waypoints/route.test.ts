import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/routes/snap-waypoints (FR-039)", () => {
  it("snaps an ordered GPX route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://localhost/api/routes/snap-waypoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waypoints: [
            { latitude: 45.4, longitude: -72.73 },
            { latitude: 45.41, longitude: -72.6 },
            { latitude: 45.42, longitude: -72.5 },
          ],
        }),
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { route: { geometry: { coordinates: number[][] } } };
    };
    expect(payload.data.route.geometry.coordinates.length).toBeGreaterThan(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects a missing waypoint list", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/snap-waypoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
  });
});
