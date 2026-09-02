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
  weatherSampleCount,
  weatherSampleGrid,
} from "./sample-grid";

const center = { latitude: 45.5, longitude: -72.75 };

describe("weatherSampleGrid (FR-043)", () => {
  it("samples the rider plus three rings of growing density", () => {
    const points = weatherSampleGrid(center);

    expect(points).toHaveLength(49);
    expect(weatherSampleCount()).toBe(points.length);
    expect(points[0]).toEqual(center);
  });

  it("spreads the rings at a third, two thirds and the full radius", () => {
    const points = weatherSampleGrid(center, 45);

    expect(haversineKm(center, points[1]!)).toBeCloseTo(15, 0);
    expect(haversineKm(center, points[9]!)).toBeCloseTo(30, 0);
    expect(haversineKm(center, points[25]!)).toBeCloseTo(45, 0);
  });

  it("puts the first point of each ring due north", () => {
    const points = weatherSampleGrid(center, 45);

    for (const first of [points[1]!, points[9]!, points[25]!]) {
      expect(initialBearingDeg(center, first)).toBeCloseTo(0, 1);
    }
  });

  /*
   * The point of the denser outer rings: a cell 45 km out must not slip between
   * two samples. Equal spacing on every ring is what covers the ground the
   * radar imagery draws (FR-043).
   */
  it("keeps neighbours the same distance apart on every ring", () => {
    const points = weatherSampleGrid(center, 45);
    const gaps = [
      haversineKm(points[1]!, points[2]!),
      haversineKm(points[9]!, points[10]!),
      haversineKm(points[25]!, points[26]!),
    ];

    for (const gap of gaps) {
      expect(gap).toBeCloseTo(gaps[0]!, 0);
      expect(gap).toBeLessThan(13);
    }
  });

  it("counts a ring of eight per step outward", () => {
    expect(weatherSampleCount(1)).toBe(9);
    expect(weatherSampleCount(2)).toBe(25);
    expect(weatherSampleGrid(center, 45, 1)).toHaveLength(9);
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
