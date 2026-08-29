import { describe, expect, it } from "vitest";
import { haversineKm, initialBearingDeg } from "@/domain/geo/distance";
import {
  DEFAULT_WEATHER_RADIUS_KM,
  roundToWeatherCell,
  MAX_WEATHER_RADIUS_KM,
  MIN_WEATHER_RADIUS_KM,
  clampRadiusKm,
  weatherAnchor,
  weatherFieldBounds,
  weatherSampleGrid,
} from "./sample-grid";

const center = { latitude: 45.5, longitude: -72.75 };

describe("weatherSampleGrid (FR-043)", () => {
  it("samples the rider plus two rings of eight", () => {
    const points = weatherSampleGrid(center);

    expect(points).toHaveLength(17);
    expect(points[0]).toEqual(center);
  });

  it("spreads the rings at half and full radius", () => {
    const points = weatherSampleGrid(center, 40);
    const inner = haversineKm(center, points[1]!);
    const outer = haversineKm(center, points[9]!);

    expect(inner).toBeCloseTo(20, 0);
    expect(outer).toBeCloseTo(40, 0);
  });

  it("puts the first point of each ring due north", () => {
    const points = weatherSampleGrid(center, 40);

    expect(initialBearingDeg(center, points[1]!)).toBeCloseTo(0, 1);
    expect(initialBearingDeg(center, points[5]!)).toBeCloseTo(180, 1);
  });

  it("clamps an absurd radius instead of failing", () => {
    expect(clampRadiusKm(0)).toBe(MIN_WEATHER_RADIUS_KM);
    expect(clampRadiusKm(5_000)).toBe(MAX_WEATHER_RADIUS_KM);
    expect(clampRadiusKm(Number.NaN)).toBe(DEFAULT_WEATHER_RADIUS_KM);
  });
});

describe("weatherFieldBounds (FR-043)", () => {
  it("frames the sampled area around the centre", () => {
    const bounds = weatherFieldBounds(center, 40);

    expect(bounds.north).toBeGreaterThan(center.latitude);
    expect(bounds.south).toBeLessThan(center.latitude);
    expect(bounds.east).toBeGreaterThan(center.longitude);
    expect(bounds.west).toBeLessThan(center.longitude);
  });
});

describe("weatherAnchor (FR-043)", () => {
  it("keeps a jittering fix inside the same cell", () => {
    expect(weatherAnchor({ latitude: 45.51, longitude: -72.79 })).toEqual(
      weatherAnchor({ latitude: 45.53, longitude: -72.81 }),
    );
  });

  it("moves to another cell once the rider has actually travelled", () => {
    expect(weatherAnchor({ latitude: 45.5, longitude: -72.75 })).not.toEqual(
      weatherAnchor({ latitude: 45.7, longitude: -72.75 }),
    );
  });

  it("rounds to a clean tenth of a degree", () => {
    expect(weatherAnchor({ latitude: 45.53, longitude: -72.77 })).toEqual({
      latitude: 45.5,
      longitude: -72.8,
    });
  });

  it("rounds one axis to the same cell, for callers memoising on primitives", () => {
    expect(roundToWeatherCell(45.53)).toBe(45.5);
    expect(roundToWeatherCell(-72.77)).toBe(-72.8);
    expect(roundToWeatherCell(Number.NaN)).toBe(0);
  });
});
