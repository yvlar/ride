import { describe, expect, it } from "vitest";
import {
  OFF_ROUTE_CONSECUTIVE_FIXES,
  OFF_ROUTE_MIN_DURATION_MS,
  RECALCULATE_COOLDOWN_MS,
} from "./constants";
import {
  emptyOffRouteTracker,
  evaluateOffRoute,
  markRecalculateStarted,
  offRouteThresholdM,
} from "./off-route";

describe("offRouteThresholdM (FR-026)", () => {
  it("is at least 60 m and scales with GPS accuracy", () => {
    expect(offRouteThresholdM(10)).toBe(60);
    expect(offRouteThresholdM(40)).toBe(80);
  });
});

describe("evaluateOffRoute (FR-026)", () => {
  it("does not recalculate after a single bad reading", () => {
    const { decision } = evaluateOffRoute({
      distanceToRouteM: 200,
      accuracyMeters: 8,
      progressKm: 1,
      nowMs: 1_000,
      navigating: true,
      recalculating: false,
      tracker: emptyOffRouteTracker(),
    });
    expect(decision.shouldRecalculate).toBe(false);
    expect(decision.reason).toBe("single_reading");
  });

  it("requires several precise fixes over a minimum duration", () => {
    let tracker = emptyOffRouteTracker();
    for (let index = 0; index < OFF_ROUTE_CONSECUTIVE_FIXES; index += 1) {
      const result = evaluateOffRoute({
        distanceToRouteM: 200,
        accuracyMeters: 8,
        progressKm: 1,
        nowMs: 1_000 + index * 1_000,
        navigating: true,
        recalculating: false,
        tracker,
      });
      tracker = result.tracker;
      expect(result.decision.shouldRecalculate).toBe(false);
    }

    const persisted = evaluateOffRoute({
      distanceToRouteM: 200,
      accuracyMeters: 8,
      progressKm: 1,
      nowMs: 1_000 + OFF_ROUTE_MIN_DURATION_MS,
      navigating: true,
      recalculating: false,
      tracker,
    });
    expect(persisted.decision.offRoute).toBe(true);
    expect(persisted.decision.shouldRecalculate).toBe(true);
    expect(persisted.decision.reason).toBe("persistent_off_route");
  });

  it("does not treat a close parallel advance as off-route", () => {
    const { decision } = evaluateOffRoute({
      distanceToRouteM: 70,
      accuracyMeters: 8,
      progressKm: 2.2,
      nowMs: 20_000,
      navigating: true,
      recalculating: false,
      tracker: { ...emptyOffRouteTracker(), lastProgressKm: 2.1 },
    });
    expect(decision.reason).toBe("parallel_or_shortcut");
    expect(decision.shouldRecalculate).toBe(false);
  });

  it("honors the cooldown between two recalculations", () => {
    const tracker = markRecalculateStarted(emptyOffRouteTracker(), 50_000);
    const { decision } = evaluateOffRoute({
      distanceToRouteM: 300,
      accuracyMeters: 8,
      progressKm: 1,
      nowMs: 50_000 + RECALCULATE_COOLDOWN_MS - 1,
      navigating: true,
      recalculating: false,
      tracker,
    });
    expect(decision.reason).toBe("cooldown");
    expect(decision.shouldRecalculate).toBe(false);
  });

  it("does not recalculate when accuracy is poor, already rerouting, or stopped", () => {
    expect(
      evaluateOffRoute({
        distanceToRouteM: 400,
        accuracyMeters: 200,
        progressKm: 1,
        nowMs: 1,
        navigating: true,
        recalculating: false,
        tracker: emptyOffRouteTracker(),
      }).decision.reason,
    ).toBe("low_accuracy");
    expect(
      evaluateOffRoute({
        distanceToRouteM: 400,
        accuracyMeters: 8,
        progressKm: 1,
        nowMs: 1,
        navigating: true,
        recalculating: true,
        tracker: emptyOffRouteTracker(),
      }).decision.reason,
    ).toBe("already_recalculating");
    expect(
      evaluateOffRoute({
        distanceToRouteM: 400,
        accuracyMeters: 8,
        progressKm: 1,
        nowMs: 1,
        navigating: false,
        recalculating: false,
        tracker: emptyOffRouteTracker(),
      }).decision.reason,
    ).toBe("stopped");
  });
});
