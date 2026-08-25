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

  it("describes an imported GPX ride (FR-039)", () => {
    const summary = summarizeRideRequest({
      type: "gpx",
      start: {
        label: "Granby, QC",
        coordinates: { latitude: 45.4, longitude: -72.73 },
      },
      destination: {
        label: "Arrivée GPX",
        coordinates: { latitude: 45.5, longitude: -72.6 },
      },
      name: "Cantons",
    });
    expect(summary).toBe(
      "Trajet GPX : Cantons au départ de Granby, QC.",
    );
  });
});
