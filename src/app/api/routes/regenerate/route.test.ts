import { describe, expect, it } from "vitest";
import { generateRide } from "@/application/generate-ride";
import type { LineString } from "@/domain/geo/types";
import { REGENERATION_MAX_OVERLAP_PERCENT } from "@/domain/ride/constants";
import { measureOverlapPercent } from "@/domain/ride/overlap";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import { POST } from "./route";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

describe("POST /api/routes/regenerate", () => {
  it("returns a distinct loop from the same criteria (FR-012)", async () => {
    const request = {
      type: "loop" as const,
      start: GRANBY,
      targetDistanceKm: 80,
      style: "scenic" as const,
    };
    const first = await generateRide(request, new MockRoutingProvider());
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }

    const response = await POST(
      new Request("http://localhost/api/routes/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request,
          previousRoute: {
            type: first.route.type,
            geometry: first.route.geometry,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    const payload = (await response.json()) as {
      data: {
        route: {
          type: string;
          geometry: LineString;
        };
      };
      meta: { requestId: string };
    };
    expect(payload.data.route.type).toBe("loop");
    expect(payload.meta.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(
      measureOverlapPercent(first.route.geometry, payload.data.route.geometry),
    ).toBeLessThanOrEqual(REGENERATION_MAX_OVERLAP_PERCENT);
  });

  it("rejects an invalid envelope (FR-012)", async () => {
    const response = await POST(
      new Request("http://localhost/api/routes/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "loop",
          start: GRANBY,
          targetDistanceKm: 80,
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });
});
