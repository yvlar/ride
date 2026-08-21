import { describe, expect, it } from "vitest";
import { generateRide } from "./generate-ride";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

const TREMBLANT = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

describe("generateRide", () => {
  it("dispatches a loop request to FR-001", async () => {
    const result = await generateRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("loop");
  });

  it("dispatches a destination request to FR-002", async () => {
    const result = await generateRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "scenic",
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
  });

  it("still rejects round_trip (FR-003)", async () => {
    const result = await generateRide({
      type: "round_trip",
      start: GRANBY,
      destination: TREMBLANT,
      style: "touring",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("UNSUPPORTED_RIDE_TYPE");
  });
});
