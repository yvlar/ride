import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import {
  MAX_CLOUD_SCALE,
  cloudScale,
  mergeOverlappingClouds,
  metersPerPixel,
} from "./weather-cloud-clusters";
import type { WeatherCloudMarker } from "./weather-overlay";

const CENTER: Coordinates = { latitude: 46.35, longitude: -72.55 };

function cloud(
  id: string,
  coordinates: Coordinates,
  overrides: Partial<WeatherCloudMarker> = {},
): WeatherCloudMarker {
  return {
    id,
    coordinates,
    level: "cloudy",
    probability: 20,
    label: "Nuageux, 20 % de risque de pluie",
    ...overrides,
  };
}

/** A point `km` east of the centre, which is how a gap is described here. */
function east(km: number): Coordinates {
  return offsetCoordinates(CENTER, 90, km);
}

describe("mergeOverlappingClouds (FR-043)", () => {
  it("leaves clouds that do not touch alone", () => {
    // At zoom 9 a cloud reaches about 4 km: 40 km apart is nowhere near.
    const clusters = mergeOverlappingClouds(
      [cloud("cloud-0", CENTER), cloud("cloud-1", east(40))],
      9,
    );

    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => cluster.count === 1)).toBe(true);
    expect(clusters.every((cluster) => cluster.scale === 1)).toBe(true);
  });

  it("fuses two overlapping clouds into one bigger cloud", () => {
    const clusters = mergeOverlappingClouds(
      [cloud("cloud-0", CENTER), cloud("cloud-1", east(2))],
      9,
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(2);
    expect(clusters[0].scale).toBeGreaterThan(1);
    expect(clusters[0].id).toBe("cloud-0+cloud-1");
  });

  it("draws the fused cloud between the points it stands for", () => {
    const [cluster] = mergeOverlappingClouds(
      [cloud("cloud-0", CENTER), cloud("cloud-1", east(2))],
      9,
    );

    expect(cluster.coordinates.latitude).toBeCloseTo(
      (CENTER.latitude + east(2).latitude) / 2,
      6,
    );
    expect(cluster.coordinates.longitude).toBeCloseTo(
      (CENTER.longitude + east(2).longitude) / 2,
      6,
    );
  });

  it("keeps the worst sky and the highest risk of what it swallowed", () => {
    const [cluster] = mergeOverlappingClouds(
      [
        cloud("cloud-0", CENTER, {
          level: "cloudy",
          probability: 20,
          label: "Nuageux, 20 % de risque de pluie",
        }),
        cloud("cloud-1", east(2), {
          level: "storm",
          probability: 85,
          label: "Orage, 85 % de risque de pluie",
        }),
      ],
      9,
    );

    expect(cluster.level).toBe("storm");
    expect(cluster.probability).toBe(85);
    expect(cluster.label).toBe(
      "Orage, 85 % de risque de pluie, 2 zones regroupées",
    );
  });

  it("keeps merging until nothing overlaps any more", () => {
    // A row of three, each within the reach of the next at this zoom: the
    // fusion of the first two is re-tested against the third, which it eats.
    const clusters = mergeOverlappingClouds(
      [
        cloud("cloud-0", CENTER),
        cloud("cloud-1", east(7)),
        cloud("cloud-2", east(14)),
      ],
      8,
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(3);
  });

  it("pulls the clouds apart again as the rider zooms in", () => {
    const clouds = [cloud("cloud-0", CENTER), cloud("cloud-1", east(6))];

    expect(mergeOverlappingClouds(clouds, 8)).toHaveLength(1);
    expect(mergeOverlappingClouds(clouds, 12)).toHaveLength(2);
  });

  it("leaves every cloud in place when the map cannot report a zoom", () => {
    const clusters = mergeOverlappingClouds(
      [cloud("cloud-0", CENTER), cloud("cloud-1", east(1))],
      null,
    );

    expect(clusters).toHaveLength(2);
    expect(clusters.map((cluster) => cluster.label)).toEqual([
      "Nuageux, 20 % de risque de pluie",
      "Nuageux, 20 % de risque de pluie",
    ]);
  });

  it("caps how big a fusion can grow, so it never eats the map", () => {
    expect(cloudScale(1)).toBe(1);
    expect(cloudScale(2)).toBeGreaterThan(1);
    expect(cloudScale(3)).toBeGreaterThan(cloudScale(2));
    expect(cloudScale(40)).toBe(MAX_CLOUD_SCALE);
  });
});

describe("metersPerPixel", () => {
  it("halves with every zoom level", () => {
    expect(metersPerPixel(0, 5) / metersPerPixel(0, 6)).toBeCloseTo(2, 6);
  });

  it("shrinks towards the poles, as Mercator does", () => {
    expect(metersPerPixel(60, 8)).toBeCloseTo(metersPerPixel(0, 8) / 2, 3);
  });
});
