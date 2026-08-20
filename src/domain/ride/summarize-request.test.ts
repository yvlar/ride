import { describe, expect, it } from "vitest";
import { summarizeRideRequest } from "./summarize-request";

describe("summarizeRideRequest", () => {
  it("describes a composed loop in French", () => {
    const summary = summarizeRideRequest({
      type: "loop",
      start: {
        label: "Granby, QC",
        coordinates: { latitude: 45.4, longitude: -72.73 },
      },
      targetDistanceKm: 200,
      style: "scenic",
      preferences: { avoidHighways: false, avoidUnpaved: false },
    });

    expect(summary).toBe(
      "Demande prête : boucle d’environ 200 km au départ de Granby, QC, style panoramique.",
    );
  });
});
