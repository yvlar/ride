import { describe, expect, it } from "vitest";
import { parseLoopRideRequest, unsupportedRideTypeMessage } from "./schemas";

const start = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

describe("parseLoopRideRequest (FR-001)", () => {
  it("accepts a loop with a target distance", () => {
    const request = parseLoopRideRequest({
      type: "loop",
      start,
      targetDistanceKm: 80,
    });

    expect(request.type).toBe("loop");
    expect(request.targetDistanceKm).toBe(80);
  });

  it("accepts a loop with only an available duration", () => {
    const request = parseLoopRideRequest({
      type: "loop",
      start,
      availableDurationMinutes: 120,
      style: "scenic",
    });

    expect(request.availableDurationMinutes).toBe(120);
    expect(request.style).toBe("scenic");
  });

  it("rejects a loop without distance or duration", () => {
    expect(() =>
      parseLoopRideRequest({
        type: "loop",
        start,
      }),
    ).toThrow(/distance cible ou une durée disponible/);
  });

  it("rejects a destination request as an unsupported type", () => {
    expect(unsupportedRideTypeMessage("destination")).toMatch(/FR-001/);
    expect(unsupportedRideTypeMessage("round_trip")).toMatch(/FR-001/);
  });
});
