import { describe, expect, it } from "vitest";
import {
  AVAILABLE_DURATION_HINT,
  AVAILABLE_DURATION_POSITIVE_MESSAGE,
  AVERAGE_SPEED_KMH,
  availableDurationCeilingWarning,
  clearlyExceedsAvailableDuration,
  durationToEstimatedDistanceKm,
  hoursToMinutes,
  isValidAvailableDurationMinutes,
  parseAvailableDurationMinutes,
  resolveTargetDistanceKm,
  withAvailableDurationCeiling,
} from "./duration";

describe("durationToEstimatedDistanceKm (FR-010, BR-005)", () => {
  it("uses a lower average speed for curvy than for touring", () => {
    const hours = hoursToMinutes(2);
    const curvy = durationToEstimatedDistanceKm(hours, "curvy");
    const scenic = durationToEstimatedDistanceKm(hours, "scenic");
    const touring = durationToEstimatedDistanceKm(hours, "touring");

    expect(curvy).toBe(2 * AVERAGE_SPEED_KMH.curvy);
    expect(scenic).toBe(2 * AVERAGE_SPEED_KMH.scenic);
    expect(touring).toBe(2 * AVERAGE_SPEED_KMH.touring);
    expect(curvy).toBeLessThan(scenic);
    expect(scenic).toBeLessThan(touring);
  });

  it("keeps the conversion in the domain without a routing provider", () => {
    expect(durationToEstimatedDistanceKm(60, "scenic")).toBe(
      AVERAGE_SPEED_KMH.scenic,
    );
  });
});

describe("resolveTargetDistanceKm (FR-010)", () => {
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
    ).toBe(AVERAGE_SPEED_KMH.touring);
  });

  it("returns undefined when neither distance nor duration is provided", () => {
    expect(resolveTargetDistanceKm({ style: "scenic" })).toBeUndefined();
  });
});

describe("parseAvailableDurationMinutes (FR-010)", () => {
  it("accepts an optional positive duration", () => {
    expect(parseAvailableDurationMinutes(180)).toEqual({
      ok: true,
      availableDurationMinutes: 180,
    });
  });

  it("allows a missing duration", () => {
    expect(parseAvailableDurationMinutes(null)).toEqual({
      ok: true,
      availableDurationMinutes: undefined,
    });
    expect(parseAvailableDurationMinutes(undefined)).toEqual({
      ok: true,
      availableDurationMinutes: undefined,
    });
  });

  it("rejects a non-positive duration", () => {
    expect(parseAvailableDurationMinutes(0)).toEqual({
      ok: false,
      message: AVAILABLE_DURATION_POSITIVE_MESSAGE,
    });
    expect(parseAvailableDurationMinutes(-30)).toEqual({
      ok: false,
      message: AVAILABLE_DURATION_POSITIVE_MESSAGE,
    });
  });

  it("rejects a non-finite duration", () => {
    expect(parseAvailableDurationMinutes(Number.NaN)).toEqual({
      ok: false,
      message: AVAILABLE_DURATION_POSITIVE_MESSAGE,
    });
  });
});

describe("isValidAvailableDurationMinutes (FR-010)", () => {
  it("accepts only a finite duration greater than 0", () => {
    expect(isValidAvailableDurationMinutes(90)).toBe(true);
    expect(isValidAvailableDurationMinutes(0)).toBe(false);
    expect(isValidAvailableDurationMinutes(null)).toBe(false);
    expect(isValidAvailableDurationMinutes(undefined)).toBe(false);
  });
});

describe("available duration ceiling (FR-010)", () => {
  it("flags a route whose estimated duration clearly exceeds the available time", () => {
    expect(clearlyExceedsAvailableDuration(220, 180)).toBe(true);
    expect(
      availableDurationCeilingWarning(220, 180),
    ).toBe(
      "La durée estimée (220 min) dépasse nettement la durée disponible (180 min).",
    );
  });

  it("does not flag a duration within the available time after minute rounding", () => {
    expect(clearlyExceedsAvailableDuration(180, 180)).toBe(false);
    expect(clearlyExceedsAvailableDuration(180.4, 180)).toBe(false);
  });

  it("appends a ceiling warning once when duration and distance are both set", () => {
    const evaluation = {
      warnings: ["autre"],
      candidate: { durationMinutes: 240 },
    };
    const both = {
      availableDurationMinutes: 120,
      explicitTargetDistanceKm: 80,
    };

    expect(withAvailableDurationCeiling(evaluation, both).warnings).toEqual([
      "autre",
      availableDurationCeilingWarning(240, 120),
    ]);
    expect(withAvailableDurationCeiling(evaluation, {}).warnings).toEqual([
      "autre",
    ]);
    expect(
      withAvailableDurationCeiling(evaluation, {
        availableDurationMinutes: 120,
      }).warnings,
    ).toEqual(["autre"]);
    expect(
      withAvailableDurationCeiling(
        {
          ...evaluation,
          warnings: [availableDurationCeilingWarning(240, 120)],
        },
        both,
      ).warnings,
    ).toHaveLength(1);
  });
});

describe("AVAILABLE_DURATION_HINT (FR-010)", () => {
  it("keeps hours explicit and states both duration roles", () => {
    expect(AVAILABLE_DURATION_HINT).toMatch(/heures/i);
    expect(AVAILABLE_DURATION_HINT).toMatch(/plafond/i);
  });
});
