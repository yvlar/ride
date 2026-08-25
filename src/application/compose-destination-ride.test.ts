import { describe, expect, it } from "vitest";
import { composeDestinationRide } from "./compose-destination-ride";
import { DEFAULT_ROUTE_PREFERENCES } from "@/domain/ride/stored-route-preferences";

const gps = {
  label: "12 Rue Principale, Granby",
  coordinates: { latitude: 45.4, longitude: -72.73 },
};

const destination = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

describe("composeDestinationRide (FR-038, FR-002)", () => {
  it("builds a destination request from GPS origin without distance or duration", () => {
    const result = composeDestinationRide({
      start: gps,
      destination,
      preferences: {
        avoidHighways: false,
        avoidUnpaved: true,
        stayInCanada: true,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.request).toMatchObject({
      type: "destination",
      start: gps,
      destination,
      style: "scenic",
      preferences: {
        avoidHighways: false,
        avoidUnpaved: true,
        stayInCanada: true,
      },
    });
    expect(result.request).not.toHaveProperty("targetDistanceKm");
    expect(result.request).not.toHaveProperty("availableDurationMinutes");
  });

  it("uses stored-preference defaults and scenic style when omitted", () => {
    const result = composeDestinationRide({
      start: gps,
      destination,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.request.style).toBe("scenic");
    expect(result.request.preferences).toEqual(DEFAULT_ROUTE_PREFERENCES);
  });

  it("rejects a missing GPS origin", () => {
    const result = composeDestinationRide({
      start: null,
      destination,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.field).toBe("start");
  });

  it("rejects a missing destination (FR-018)", () => {
    const result = composeDestinationRide({
      start: gps,
      destination: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.field).toBe("destination");
  });
});
