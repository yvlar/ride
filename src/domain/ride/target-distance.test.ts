import { describe, expect, it } from "vitest";
import {
  TARGET_DISTANCE_HINT_OPTIONAL,
  TARGET_DISTANCE_HINT_OPTIONAL_WITH_DURATION,
  TARGET_DISTANCE_HINT_REQUIRED,
  TARGET_DISTANCE_POSITIVE_KM_MESSAGE,
  TARGET_DISTANCE_REQUIRED_MESSAGE,
  isTargetDistanceRequired,
  isValidTargetDistanceKm,
  parseTargetDistanceKm,
  targetDistanceHint,
} from "./target-distance";

describe("isTargetDistanceRequired (FR-009)", () => {
  it("requires a target distance for a loop without an available duration", () => {
    expect(isTargetDistanceRequired("loop", false)).toBe(true);
  });

  it("does not require a target distance for a loop when a duration is provided", () => {
    expect(isTargetDistanceRequired("loop", true)).toBe(false);
  });

  it("keeps the target distance optional for a destination ride", () => {
    expect(isTargetDistanceRequired("destination", false)).toBe(false);
    expect(isTargetDistanceRequired("destination", true)).toBe(false);
  });

  it("keeps the target distance optional for a round trip", () => {
    expect(isTargetDistanceRequired("round_trip", false)).toBe(false);
    expect(isTargetDistanceRequired("round_trip", true)).toBe(false);
  });
});

describe("targetDistanceHint (FR-009)", () => {
  it("keeps kilometres explicit and states when the field is required", () => {
    expect(targetDistanceHint("loop", false)).toBe(TARGET_DISTANCE_HINT_REQUIRED);
    expect(targetDistanceHint("loop", false)).toMatch(/kilomètres/i);
  });

  it("states that a loop distance is optional when a duration is set", () => {
    expect(targetDistanceHint("loop", true)).toBe(
      TARGET_DISTANCE_HINT_OPTIONAL_WITH_DURATION,
    );
  });

  it("states that destination and round-trip distances are optional", () => {
    expect(targetDistanceHint("destination", false)).toBe(
      TARGET_DISTANCE_HINT_OPTIONAL,
    );
    expect(targetDistanceHint("round_trip", false)).toBe(
      TARGET_DISTANCE_HINT_OPTIONAL,
    );
  });
});

describe("parseTargetDistanceKm (FR-009)", () => {
  it("accepts an explicit positive distance in kilometres", () => {
    expect(parseTargetDistanceKm(200, { required: true })).toEqual({
      ok: true,
      targetDistanceKm: 200,
    });
  });

  it("rejects a missing distance when it is required", () => {
    expect(parseTargetDistanceKm(null, { required: true })).toEqual({
      ok: false,
      message: TARGET_DISTANCE_REQUIRED_MESSAGE,
    });
    expect(parseTargetDistanceKm(undefined, { required: true })).toEqual({
      ok: false,
      message: TARGET_DISTANCE_REQUIRED_MESSAGE,
    });
  });

  it("allows a missing distance when it is optional", () => {
    expect(parseTargetDistanceKm(null, { required: false })).toEqual({
      ok: true,
      targetDistanceKm: undefined,
    });
  });

  it("rejects a non-positive distance and keeps the unit in the message", () => {
    expect(parseTargetDistanceKm(0, { required: false })).toEqual({
      ok: false,
      message: TARGET_DISTANCE_POSITIVE_KM_MESSAGE,
    });
    expect(parseTargetDistanceKm(-12, { required: true })).toEqual({
      ok: false,
      message: TARGET_DISTANCE_POSITIVE_KM_MESSAGE,
    });
    expect(TARGET_DISTANCE_POSITIVE_KM_MESSAGE).toMatch(/km/);
  });

  it("rejects a non-finite distance", () => {
    expect(parseTargetDistanceKm(Number.NaN, { required: false })).toEqual({
      ok: false,
      message: TARGET_DISTANCE_POSITIVE_KM_MESSAGE,
    });
  });
});

describe("isValidTargetDistanceKm (FR-009)", () => {
  it("accepts only a finite distance greater than 0 km", () => {
    expect(isValidTargetDistanceKm(80)).toBe(true);
    expect(isValidTargetDistanceKm(0)).toBe(false);
    expect(isValidTargetDistanceKm(null)).toBe(false);
    expect(isValidTargetDistanceKm(undefined)).toBe(false);
  });
});
