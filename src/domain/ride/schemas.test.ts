import { describe, expect, it } from "vitest";
import {
  describedOneWayRideRequestSchema,
  parseDestinationRideRequest,
  parseGpxRideRequest,
  parseLoopRideRequest,
  parseRoundTripRideRequest,
  unsupportedRideTypeMessage,
} from "./schemas";
import { DEFAULT_ROUTE_PREFERENCES } from "./stored-route-preferences";

const start = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

const destination = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
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

  it("accepts a loop with only an available duration (FR-010)", () => {
    const request = parseLoopRideRequest({
      type: "loop",
      start,
      availableDurationMinutes: 120,
      style: "scenic",
    });

    expect(request.availableDurationMinutes).toBe(120);
    expect(request.style).toBe("scenic");
  });

  it("strips the transport-only knowledge flag (FR-029, BR-004)", () => {
    const request = parseLoopRideRequest({
      type: "loop",
      start,
      targetDistanceKm: 80,
      useKnowledgeRouting: true,
    });

    expect(request).not.toHaveProperty("useKnowledgeRouting");
  });

  it("rejects a loop without distance or duration (FR-009)", () => {
    expect(() =>
      parseLoopRideRequest({
        type: "loop",
        start,
      }),
    ).toThrow(/distance cible \(FR-009\) ou une durée disponible/);
  });

  it("rejects a non-positive target distance (FR-009)", () => {
    expect(() =>
      parseLoopRideRequest({
        type: "loop",
        start,
        targetDistanceKm: 0,
      }),
    ).toThrow();
  });
});

describe("parseDestinationRideRequest (FR-002)", () => {
  it("requires a start, a destination, and a driving style", () => {
    const request = parseDestinationRideRequest({
      type: "destination",
      start,
      destination,
      style: "curvy",
    });

    expect(request.type).toBe("destination");
    expect(request.destination.label).toBe("Mont-Tremblant");
    expect(request.style).toBe("curvy");
    expect(request.targetDistanceKm).toBeUndefined();
  });

  it("accepts an optional target distance (FR-009)", () => {
    const request = parseDestinationRideRequest({
      type: "destination",
      start,
      destination,
      style: "scenic",
      targetDistanceKm: 220,
    });

    expect(request.targetDistanceKm).toBe(220);
  });

  it("accepts an optional available duration (FR-010)", () => {
    const request = parseDestinationRideRequest({
      type: "destination",
      start,
      destination,
      style: "curvy",
      availableDurationMinutes: 150,
    });

    expect(request.availableDurationMinutes).toBe(150);
  });

  it("rejects a destination coinciding with the start", () => {
    expect(() =>
      parseDestinationRideRequest({
        type: "destination",
        start,
        destination: start,
        style: "touring",
      }),
    ).toThrow(/trop proches/);
  });

  it("accepts a described one-way whose leftover arrival is near the start (FR-034)", () => {
    const parsed = describedOneWayRideRequestSchema.safeParse({
      type: "destination",
      start,
      destination: start,
      targetDistanceKm: 80,
      style: "scenic",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a destination request without a style", () => {
    expect(() =>
      parseDestinationRideRequest({
        type: "destination",
        start,
        destination,
      }),
    ).toThrow();
  });
});

describe("parseRoundTripRideRequest (FR-003)", () => {
  it("requires a start, a destination, and a driving style", () => {
    const request = parseRoundTripRideRequest({
      type: "round_trip",
      start,
      destination,
      style: "touring",
    });

    expect(request.type).toBe("round_trip");
    expect(request.destination.label).toBe("Mont-Tremblant");
    expect(request.style).toBe("touring");
    expect(request.targetDistanceKm).toBeUndefined();
  });

  it("accepts an optional target distance (FR-009)", () => {
    const request = parseRoundTripRideRequest({
      type: "round_trip",
      start,
      destination,
      style: "scenic",
      targetDistanceKm: 400,
    });

    expect(request.targetDistanceKm).toBe(400);
  });

  it("accepts distance and duration together (FR-010)", () => {
    const request = parseRoundTripRideRequest({
      type: "round_trip",
      start,
      destination,
      style: "touring",
      targetDistanceKm: 300,
      availableDurationMinutes: 240,
    });

    expect(request.targetDistanceKm).toBe(300);
    expect(request.availableDurationMinutes).toBe(240);
  });

  it("rejects a destination coinciding with the start", () => {
    expect(() =>
      parseRoundTripRideRequest({
        type: "round_trip",
        start,
        destination: start,
        style: "touring",
      }),
    ).toThrow(/trop proches/);
  });
});

describe("unsupportedRideTypeMessage", () => {
  it("points a misplaced round_trip at the FR-003 generator", () => {
    expect(unsupportedRideTypeMessage("round_trip")).toMatch(/FR-003/);
    expect(unsupportedRideTypeMessage("unknown")).toMatch(/FR-003/);
  });
});

describe("parseGpxRideRequest (FR-039)", () => {
  it("accepts a GPX ride request", () => {
    const request = parseGpxRideRequest({
      type: "gpx",
      start,
      destination,
      name: "Cantons",
      style: "touring",
    });
    expect(request.type).toBe("gpx");
    expect(request.name).toBe("Cantons");
    expect(request.preferences).toEqual(DEFAULT_ROUTE_PREFERENCES);
  });
});
