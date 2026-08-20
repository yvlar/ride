import { describe, expect, it } from "vitest";
import { radiusCoefficientOfVariation } from "@/domain/geo/geometry";
import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { MockRoutingProvider } from "./mock-routing-provider";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

describe("MockRoutingProvider", () => {
  it("returns a closed road-network loop rather than a geometric circle (FR-001)", async () => {
    const provider = new MockRoutingProvider();
    const east = { latitude: 45.403, longitude: -72.5 };
    const north = { latitude: 45.55, longitude: -72.734 };
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: GRANBY,
      waypoints: [east, north],
    });

    const first = result.geometry.coordinates[0];
    const last = result.geometry.coordinates[result.geometry.coordinates.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (!first || !last) {
      return;
    }

    expect(
      haversineKm(GRANBY, {
        longitude: first[0],
        latitude: first[1],
      }),
    ).toBeLessThan(2.1);
    expect(
      haversineKm(GRANBY, {
        longitude: last[0],
        latitude: last[1],
      }),
    ).toBeLessThan(2.1);
    expect(result.geometry.coordinates.length).toBeGreaterThan(8);
    expect(radiusCoefficientOfVariation(result.geometry)).toBeGreaterThan(0.06);
    expect(result.distanceKm).toBeGreaterThan(0);
  });
});
