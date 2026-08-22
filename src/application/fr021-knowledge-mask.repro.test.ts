import { describe, expect, it } from "vitest";
import { createCircleLineString } from "@/domain/geo/geometry";
import { unpavedKnowledgeError } from "@/infrastructure/routing/routing-knowledge-error";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";
import { generateDestinationRide } from "./generate-destination-ride";
import { generateLoopRide } from "./generate-loop-ride";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

const TREMBLANT = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

function circleThenUnpaved(): RoutingProvider {
  let calls = 0;
  return {
    async calculateRoute(
      input: ProviderRouteRequest,
    ): Promise<ProviderRouteResult> {
      calls += 1;
      if (calls === 1) {
        return {
          geometry: createCircleLineString(input.start, 12, 36),
          segments: [],
          distanceKm: 75,
          durationMinutes: 80,
        };
      }
      throw unpavedKnowledgeError();
    },
  };
}

describe("FR-021 knowledge is not masked by an invalid fulfill", () => {
  it("generateLoopRide maps unpaved knowledge + a geometric circle to the FR-021 message", async () => {
    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      circleThenUnpaved(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.message).toMatch(/non pavées/);
    expect(result.error.message).toMatch(/FR-021/);
  });

  it("generateDestinationRide maps unpaved knowledge + an unusable circle to the FR-021 message", async () => {
    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "scenic",
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      circleThenUnpaved(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.message).toMatch(/non pavées/);
    expect(result.error.message).toMatch(/FR-021/);
  });
});
