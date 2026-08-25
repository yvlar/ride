import { describe, expect, it } from "vitest";
import {
  composeDescribedRegenerateRequest,
  composeDescribedRide,
  describedArrivalPlace,
  describedRequestFromGeneratedRoute,
  describedRouteMatchesReturnToStart,
  describedStartPlace,
} from "./compose-described-ride";

const gps = describedStartPlace({ latitude: 45.4, longitude: -72.73 });

describe("composeDescribedRide (FR-034)", () => {
  it("builds a loop from GPS and distance without duration (FR-001, FR-009)", () => {
    const result = composeDescribedRide({
      start: gps,
      targetDistanceKm: 180,
      preferences: {
        avoidHighways: true,
        avoidUnpaved: true,
        stayInCanada: false,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.request).toMatchObject({
      type: "loop",
      start: gps,
      targetDistanceKm: 180,
      style: "scenic",
      preferences: {
        avoidHighways: true,
        avoidUnpaved: true,
        stayInCanada: false,
      },
    });
    expect(result.request).not.toHaveProperty("availableDurationMinutes");
  });

  it("rejects a missing GPS origin", () => {
    const result = composeDescribedRide({
      start: null,
      targetDistanceKm: 100,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.field).toBe("start");
  });

  it("rejects a distance outside 20–500 km", () => {
    expect(composeDescribedRide({ start: gps, targetDistanceKm: 10 }).ok).toBe(
      false,
    );
    expect(composeDescribedRide({ start: gps, targetDistanceKm: 600 }).ok).toBe(
      false,
    );
  });

  it("maps a generated one-way onto a destination request (FR-034, FR-002)", () => {
    const preferences = {
      avoidHighways: true,
      avoidUnpaved: true,
      stayInCanada: false,
    };
    const arrival = describedArrivalPlace({ latitude: 45.5, longitude: -72.5 });
    const request = describedRequestFromGeneratedRoute(
      {
        id: "route-1",
        type: "destination",
        start: gps,
        destination: arrival,
        style: "scenic",
        targetDistanceKm: 80,
        geometry: { type: "LineString", coordinates: [[-72.73, 45.4]] },
        segments: [],
        distanceKm: 78,
        durationMinutes: 70,
        warnings: [],
      },
      preferences,
    );
    expect(request).toMatchObject({
      type: "destination",
      start: gps,
      destination: arrival,
      targetDistanceKm: 80,
      preferences,
    });
  });

  it("rebuilds a destination regenerate request from the generated one-way (FR-012, FR-034)", () => {
    const preferences = {
      avoidHighways: true,
      avoidUnpaved: true,
      stayInCanada: false,
    };
    const arrival = describedArrivalPlace({ latitude: 45.5, longitude: -72.5 });
    const moved = describedStartPlace({ latitude: 45.41, longitude: -72.74 });
    const result = composeDescribedRegenerateRequest({
      start: moved,
      targetDistanceKm: 120,
      preferences,
      previousRoute: {
        id: "route-1",
        type: "destination",
        start: gps,
        destination: arrival,
        style: "scenic",
        targetDistanceKm: 80,
        geometry: { type: "LineString", coordinates: [[-72.73, 45.4]] },
        segments: [],
        distanceKm: 78,
        durationMinutes: 70,
        warnings: [],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.request).toMatchObject({
      type: "destination",
      start: moved,
      destination: arrival,
      targetDistanceKm: 120,
      preferences,
    });
  });

  it("matches Boucle to the generated route type (FR-034)", () => {
    expect(describedRouteMatchesReturnToStart({ type: "loop" }, true)).toBe(true);
    expect(
      describedRouteMatchesReturnToStart({ type: "destination" }, false),
    ).toBe(true);
    expect(
      describedRouteMatchesReturnToStart({ type: "destination" }, true),
    ).toBe(false);
  });
});
