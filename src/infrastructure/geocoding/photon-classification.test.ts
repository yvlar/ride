import { describe, expect, it } from "vitest";
import {
  classifyPhotonPlace,
  parsePhotonExtent,
  photonPrecision,
} from "./photon-classification";

describe("classifyPhotonPlace (FR-038)", () => {
  it("reads a postal code from osm_value, never from the type", () => {
    // Photon reports `type: "other"` on a postcode feature, so a classifier
    // keyed on `type` would silently miss every postal-code search.
    expect(
      classifyPhotonPlace({
        osmKey: "place",
        osmValue: "postcode",
        type: "other",
        hasHouseNumber: false,
      }),
    ).toBe("postal_code");
  });

  it("treats any feature carrying a house number as an address", () => {
    expect(
      classifyPhotonPlace({
        osmKey: "place",
        osmValue: "house",
        type: "house",
        hasHouseNumber: true,
      }),
    ).toBe("address");
  });

  it("classifies a numbered point of interest as an address too", () => {
    // `type: "house"` covers shops with a street number, not just dwellings.
    expect(
      classifyPhotonPlace({
        osmKey: "shop",
        osmValue: "supermarket",
        type: "house",
        hasHouseNumber: true,
      }),
    ).toBe("address");
  });

  it("classifies a street segment as an address", () => {
    expect(
      classifyPhotonPlace({
        osmKey: "highway",
        osmValue: "residential",
        type: "street",
        hasHouseNumber: false,
      }),
    ).toBe("address");
  });

  it.each(["city", "district", "locality", "county", "village", "town"])(
    "classifies %s as a municipality",
    (type) => {
      expect(
        classifyPhotonPlace({ osmKey: "place", osmValue: type, type, hasHouseNumber: false }),
      ).toBe("city");
    },
  );

  it("falls back to a generic place for anything else", () => {
    expect(
      classifyPhotonPlace({
        osmKey: "leisure",
        osmValue: "park",
        type: "other",
        hasHouseNumber: false,
      }),
    ).toBe("place");
    expect(
      classifyPhotonPlace({
        osmKey: "place",
        osmValue: "state",
        type: "state",
        hasHouseNumber: false,
      }),
    ).toBe("place");
  });

  it("does not mistake an unnumbered point of interest for an address", () => {
    expect(
      classifyPhotonPlace({
        osmKey: "amenity",
        osmValue: "restaurant",
        type: "house",
        hasHouseNumber: false,
      }),
    ).toBe("place");
  });
});

describe("photonPrecision (FR-038)", () => {
  it("marks a numbered address exact", () => {
    expect(photonPrecision("address", { hasHouseNumber: true, type: "house" })).toBe(
      "exact",
    );
  });

  it("marks a street segment approximate so the marker can be adjusted", () => {
    expect(
      photonPrecision("address", { hasHouseNumber: false, type: "street" }),
    ).toBe("approximate");
  });

  it("marks zones approximate", () => {
    expect(photonPrecision("city", { hasHouseNumber: false, type: "city" })).toBe(
      "approximate",
    );
    expect(
      photonPrecision("postal_code", { hasHouseNumber: false, type: "other" }),
    ).toBe("approximate");
  });

  it("marks a point of interest exact", () => {
    expect(photonPrecision("place", { hasHouseNumber: false, type: "house" })).toBe(
      "exact",
    );
  });
});

describe("parsePhotonExtent", () => {
  it("reads Photon's [west, north, east, south] order", () => {
    // Roxton Pond, as returned by photon.komoot.io.
    expect(
      parsePhotonExtent([-72.7020666, 45.5387429, -72.578593, 45.4031491]),
    ).toEqual({
      west: -72.7020666,
      south: 45.4031491,
      east: -72.578593,
      north: 45.5387429,
    });
  });

  it("rejects a missing or non-numeric extent", () => {
    expect(parsePhotonExtent(undefined)).toBeNull();
    expect(parsePhotonExtent([1, 2, 3])).toBeNull();
    expect(parsePhotonExtent([1, 2, 3, "nope"])).toBeNull();
  });
});
