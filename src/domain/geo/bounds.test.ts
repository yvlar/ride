import { describe, expect, it } from "vitest";
import { boundingBox, MIN_BOUNDING_SPAN_DEG } from "./bounds";
import type { LineString } from "./types";

describe("boundingBox (FR-013, BR-004)", () => {
  it("covers every vertex of a LineString", () => {
    const geometry: LineString = {
      type: "LineString",
      coordinates: [
        [-72.8, 45.3],
        [-72.5, 45.6],
        [-74.6, 46.1],
      ],
    };

    expect(boundingBox(geometry)).toEqual({
      west: -74.6,
      south: 45.3,
      east: -72.5,
      north: 46.1,
    });
  });

  it("includes extra marker coordinates that sit outside the line", () => {
    const geometry: LineString = {
      type: "LineString",
      coordinates: [
        [-72.7, 45.4],
        [-72.6, 45.5],
      ],
    };

    const box = boundingBox(geometry, [
      { latitude: 46.2, longitude: -74.6 },
    ]);

    expect(box).toEqual({
      west: -74.6,
      south: 45.4,
      east: -72.6,
      north: 46.2,
    });
  });

  it("pads a single point so the box has a non-zero span", () => {
    const geometry: LineString = {
      type: "LineString",
      coordinates: [[-72.734, 45.403]],
    };

    const box = boundingBox(geometry);

    expect(box).not.toBeNull();
    expect(box!.east - box!.west).toBeCloseTo(MIN_BOUNDING_SPAN_DEG);
    expect(box!.north - box!.south).toBeCloseTo(MIN_BOUNDING_SPAN_DEG);
    expect((box!.west + box!.east) / 2).toBeCloseTo(-72.734);
    expect((box!.south + box!.north) / 2).toBeCloseTo(45.403);
  });

  it("returns null when there are no coordinates", () => {
    expect(
      boundingBox({ type: "LineString", coordinates: [] }),
    ).toBeNull();
  });
});
