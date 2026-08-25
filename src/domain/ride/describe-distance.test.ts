import { describe, expect, it } from "vitest";
import {
  DESCRIBE_DISTANCE_DEFAULT_KM,
  DESCRIBE_DISTANCE_MAX_KM,
  DESCRIBE_DISTANCE_MIN_KM,
  DESCRIBE_DISTANCE_STORAGE_KEY,
  formatDescribeDistanceLabel,
  isDescribeDistanceKm,
  readStoredDescribeDistanceKm,
  snapDescribeDistanceKm,
  writeStoredDescribeDistanceKm,
} from "./describe-distance";

describe("describe distance slider (FR-034, FR-009)", () => {
  it("clamps the slider to 20 km and 500 km", () => {
    expect(snapDescribeDistanceKm(0)).toBe(DESCRIBE_DISTANCE_MIN_KM);
    expect(snapDescribeDistanceKm(19)).toBe(DESCRIBE_DISTANCE_MIN_KM);
    expect(snapDescribeDistanceKm(501)).toBe(DESCRIBE_DISTANCE_MAX_KM);
    expect(snapDescribeDistanceKm(2000)).toBe(DESCRIBE_DISTANCE_MAX_KM);
  });

  it("snaps to the 10 km step", () => {
    expect(snapDescribeDistanceKm(24)).toBe(20);
    expect(snapDescribeDistanceKm(25)).toBe(30);
    expect(snapDescribeDistanceKm(180)).toBe(180);
  });

  it("defaults to 100 km when nothing is stored", () => {
    expect(readStoredDescribeDistanceKm(null)).toBe(DESCRIBE_DISTANCE_DEFAULT_KM);
    expect(readStoredDescribeDistanceKm({ getItem: () => null })).toBe(100);
  });

  it("restores and persists the last chosen distance", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    writeStoredDescribeDistanceKm(storage, 180);
    expect(store.get(DESCRIBE_DISTANCE_STORAGE_KEY)).toBe("180");
    expect(readStoredDescribeDistanceKm(storage)).toBe(180);
  });

  it("formats the selected distance for display", () => {
    expect(formatDescribeDistanceLabel(180)).toBe("180 km");
    expect(isDescribeDistanceKm(20)).toBe(true);
    expect(isDescribeDistanceKm(500)).toBe(true);
    expect(isDescribeDistanceKm(19)).toBe(false);
    expect(isDescribeDistanceKm(501)).toBe(false);
  });
});
