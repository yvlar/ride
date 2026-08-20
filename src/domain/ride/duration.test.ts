import { describe, expect, it } from "vitest";
import {
  AVERAGE_SPEED_KMH,
  estimateDistanceKmFromDuration,
  hoursToMinutes,
} from "./duration";

describe("estimateDistanceKmFromDuration (BR-005)", () => {
  it("estimates a shorter distance for curvy than for touring", () => {
    const durationMinutes = hoursToMinutes(2);

    const curvyKm = estimateDistanceKmFromDuration(durationMinutes, "curvy");
    const scenicKm = estimateDistanceKmFromDuration(durationMinutes, "scenic");
    const touringKm = estimateDistanceKmFromDuration(
      durationMinutes,
      "touring",
    );

    expect(curvyKm).toBe(2 * AVERAGE_SPEED_KMH.curvy);
    expect(scenicKm).toBe(2 * AVERAGE_SPEED_KMH.scenic);
    expect(touringKm).toBe(2 * AVERAGE_SPEED_KMH.touring);
    expect(curvyKm).toBeLessThan(scenicKm);
    expect(scenicKm).toBeLessThan(touringKm);
  });

  it("rejects a non-positive duration", () => {
    expect(() => estimateDistanceKmFromDuration(0, "scenic")).toThrow(
      /positive number/,
    );
  });
});
