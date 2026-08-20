import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/geocode (FR-017)", () => {
  it("returns matching places", async () => {
    const response = await GET(
      new Request("http://localhost/api/geocode?q=tremblant"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.places).toEqual([
      {
        label: "Mont-Tremblant, QC",
        coordinates: { latitude: 46.1185, longitude: -74.5962 },
      },
    ]);
    expect(body.meta.requestId).toEqual(expect.any(String));
  });

  it("rejects a query that is too short", async () => {
    const response = await GET(new Request("http://localhost/api/geocode?q=g"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("QUERY_TOO_SHORT");
  });
});
