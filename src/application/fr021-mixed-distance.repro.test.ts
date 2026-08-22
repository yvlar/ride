import { describe, expect, it } from "vitest";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
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

function mixedFarThenUnpaved(
  forcedDistanceKm: number,
  mode: "loop" | "destination",
): RoutingProvider {
  let calls = 0;
  return {
    async calculateRoute(
      input: ProviderRouteRequest,
    ): Promise<ProviderRouteResult> {
      calls += 1;
      if (calls === 1) {
        const mock = new MockRoutingProvider(mode === "loop" ? 8 : 2);
        const routed = await mock.calculateRoute(
          mode === "loop"
            ? {
                ...input,
                waypoints: input.waypoints?.map((waypoint) => ({
                  latitude: waypoint.latitude + 1,
                  longitude: waypoint.longitude + 1,
                })),
              }
            : input,
        );
        return { ...routed, distanceKm: forcedDistanceKm };
      }
      throw unpavedKnowledgeError();
    },
  };
}

describe("FR-021 + BR-001 mixed distance/knowledge repro", () => {
  it("loop: road-network SUCCESS out of ±10% plus later unpavedKnowledgeError", async () => {
    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 50,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      mixedFarThenUnpaved(400, "loop"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    // Current bug: only BR-001 is shown; FR-021 unpaved text is dropped.
    expect(result.error.code).toBe("DISTANCE_OUT_OF_TOLERANCE");
    expect(result.error.bestCandidate?.distanceKm).toBe(400);
    expect(result.error.message).toMatch(/BR-001/);
    expect(result.error.message).not.toMatch(/FR-021/);
    expect(result.error.message).not.toMatch(/non pavées/);
  });

  it("destination: road-network SUCCESS out of ±10% plus later unpavedKnowledgeError", async () => {
    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        targetDistanceKm: 200,
        style: "scenic",
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      mixedFarThenUnpaved(900, "destination"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("DISTANCE_OUT_OF_TOLERANCE");
    expect(result.error.bestCandidate?.distanceKm).toBe(900);
    expect(result.error.message).toMatch(/BR-001/);
    expect(result.error.message).not.toMatch(/FR-021/);
    expect(result.error.message).not.toMatch(/non pavées/);
  });
});
