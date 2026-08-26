import { describe, expect, it } from "vitest";
import {
  classifyNominatimPlace,
  nominatimPrecision,
  parseNominatimBoundingBox,
} from "./nominatim-classification";

function classify(input: Partial<Parameters<typeof classifyNominatimPlace>[0]>) {
  return classifyNominatimPlace({
    hasHouseNumber: false,
    hasPostalCode: false,
    ...input,
  });
}

describe("Nominatim classification (FR-038)", () => {
  it("recognizes a postal code", () => {
    expect(classify({ type: "postcode" })).toBe("postal_code");
    expect(classify({ addressType: "postcode" })).toBe("postal_code");
  });

  it("recognizes an address by its house number or type", () => {
    expect(classify({ hasHouseNumber: true, type: "residential" })).toBe(
      "address",
    );
    expect(classify({ type: "house" })).toBe("address");
    expect(classify({ addressType: "building" })).toBe("address");
  });

  it("recognizes a municipality", () => {
    for (const type of ["city", "town", "village", "hamlet", "municipality"]) {
      expect(classify({ type })).toBe("city");
    }
  });

  it("treats a municipal boundary as a city but not a province", () => {
    expect(
      classify({ category: "boundary", type: "administrative", placeRank: 16 }),
    ).toBe("city");
    // A province or country ranks far lower and is not a destination city.
    expect(
      classify({ category: "boundary", type: "administrative", placeRank: 8 }),
    ).toBe("place");
  });

  it("falls back to a generic place", () => {
    expect(classify({ category: "leisure", type: "park" })).toBe("place");
    expect(classify({})).toBe("place");
  });

  it("marks zones as approximate and precise points as exact", () => {
    expect(nominatimPrecision("postal_code", false)).toBe("approximate");
    expect(nominatimPrecision("city", false)).toBe("approximate");
    expect(nominatimPrecision("address", true)).toBe("exact");
    expect(nominatimPrecision("place", false)).toBe("exact");
    // A house number always wins over the kind heuristic.
    expect(nominatimPrecision("city", true)).toBe("exact");
  });

  it("reads Nominatim's [south, north, west, east] bounding box", () => {
    expect(
      parseNominatimBoundingBox(["45.36", "45.44", "-72.79", "-72.68"]),
    ).toEqual({ west: -72.79, south: 45.36, east: -72.68, north: 45.44 });
    expect(parseNominatimBoundingBox(undefined)).toBeNull();
    expect(parseNominatimBoundingBox(["a", "b", "c", "d"])).toBeNull();
    expect(parseNominatimBoundingBox(["1", "2"])).toBeNull();
  });
});
