import { describe, expect, it } from "vitest";
import {
  durationToEstimatedDistanceKm,
  hoursToMinutes,
  resolveTargetDistanceKm,
} from "./duration";

describe("durationToEstimatedDistanceKm (BR-005)", () => {
  it("uses a lower average speed for curvy than for touring", () => {
    const hours = hoursToMinutes(2);
    const curvy = durationToEstimatedDistanceKm(hours, "curvy");
    const scenic = durationToEstimatedDistanceKm(hours, "scenic");
    const touring = durationToEstimatedDistanceKm(hours, "touring");

    expect(curvy).toBe(100);
    expect(scenic).toBe(130);
    expect(touring).toBe(160);
    expect(curvy).toBeLessThan(scenic);
    expect(scenic).toBeLessThan(touring);
  });
});

describe("resolveTargetDistanceKm (FR-001)", () => {
  it("keeps an explicit distance as the primary length constraint", () => {
    expect(
      resolveTargetDistanceKm({
        targetDistanceKm: 80,
        availableDurationMinutes: 180,
        style: "curvy",
      }),
    ).toBe(80);
  });

  it("converts duration when no distance is provided", () => {
    expect(
      resolveTargetDistanceKm({
        availableDurationMinutes: 60,
        style: "touring",
      }),
    ).toBe(80);
  });
});
