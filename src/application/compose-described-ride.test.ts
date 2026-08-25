import { describe, expect, it } from "vitest";
import {
  composeDescribedRide,
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
});
