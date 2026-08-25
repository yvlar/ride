import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/routes/join (FR-039)", () => {
  it("returns a connector for two coordinates", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://localhost/api/routes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { latitude: 45.4, longitude: -72.73 },
          destination: { latitude: 45.41, longitude: -72.7 },
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

  it("rejects a body without an entry point", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: { latitude: 45.4, longitude: -72.73 } }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
