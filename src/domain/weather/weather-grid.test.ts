import { describe, expect, it } from "vitest";
import { haversineKm, initialBearingDeg } from "@/domain/geo/distance";
import {
  WEATHER_DEFAULT_RADIUS_KM,
  WEATHER_MAX_RADIUS_KM,
  WEATHER_MIN_RADIUS_KM,
  clampRadiusKm,
  weatherSamplePoints,
} from "./weather-grid";

const GRANBY = { latitude: 45.4, longitude: -72.73 };

describe("grille d’échantillonnage météo (FR-043)", () => {
  it("interroge le pilote plus deux couronnes de huit points", () => {
    const points = weatherSamplePoints(GRANBY, 60);

    expect(points).toHaveLength(17);
    expect(points[0]).toEqual(GRANBY);
  });

  it("pose les couronnes à la moitié puis à la totalité du rayon", () => {
    const points = weatherSamplePoints(GRANBY, 60);
    const distances = points
      .slice(1)
      .map((point) => Math.round(haversineKm(GRANBY, point)));

    expect(distances.slice(0, 8)).toEqual(Array(8).fill(30));
    expect(distances.slice(8)).toEqual(Array(8).fill(60));
  });

  it("couvre les huit directions de la rose des vents", () => {
    const bearings = weatherSamplePoints(GRANBY, 60)
      .slice(1, 9)
      .map((point) => Math.round(initialBearingDeg(GRANBY, point)) % 360);

    expect(bearings).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it("borne le rayon demandé", () => {
    expect(clampRadiusKm(5)).toBe(WEATHER_MIN_RADIUS_KM);
    expect(clampRadiusKm(500)).toBe(WEATHER_MAX_RADIUS_KM);
    expect(clampRadiusKm(Number.NaN)).toBe(WEATHER_DEFAULT_RADIUS_KM);
    expect(clampRadiusKm(60)).toBe(60);
  });
});
