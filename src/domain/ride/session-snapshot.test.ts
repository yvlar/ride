import { describe, expect, it } from "vitest";
import { parsePersistedRideSession } from "./session-snapshot";

describe("parsePersistedRideSession (FR-023, FR-035)", () => {
  it("restores a generated ride without GPS crumbs", () => {
    const parsed = parsePersistedRideSession({
      request: {
        type: "loop",
        start: {
          label: "Granby",
          coordinates: { latitude: 45.4, longitude: -72.73 },
        },
        targetDistanceKm: 80,
      },
      route: {
        id: "r1",
        type: "loop",
        start: {
          label: "Granby",
          coordinates: { latitude: 45.4, longitude: -72.73 },
        },
        targetDistanceKm: 80,
        geometry: {
          type: "LineString",
          coordinates: [
            [-72.73, 45.4],
            [-72.7, 45.45],
          ],
        },
        segments: [],
        distanceKm: 80,
        durationMinutes: 70,
        statistics: { repeatedRoadPercent: 0 },
        warnings: [],
      },
      navigating: true,
      muted: false,
      useKnowledgeRouting: false,
      savedAtMs: 1,
    });
    expect(parsed?.navigating).toBe(true);
    expect(parsed).not.toHaveProperty("fix");
  });

  it("rejects a malformed payload", () => {
    expect(parsePersistedRideSession({ navigating: true })).toBeNull();
  });
});
