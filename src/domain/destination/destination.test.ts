import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import {
  APPROXIMATE_DESTINATION_NOTICE,
  destinationKindLabel,
  destinationSummary,
  hasMovedDestination,
  isUsableDestination,
  MAP_POINT_LABEL,
  mapPointDestination,
} from "./destination";

const granby: Place = {
  label: "125 Rue Principale, Granby, Québec, Canada",
  name: "125 Rue Principale",
  addressLine: "125 Rue Principale",
  locality: "Granby",
  region: "Québec",
  country: "Canada",
  kind: "address",
  precision: "exact",
  coordinates: { latitude: 45.4008, longitude: -72.7311 },
};

describe("destination model (FR-038)", () => {
  it("accepts a place with valid coordinates and rejects anything else", () => {
    expect(isUsableDestination(granby)).toBe(true);
    expect(isUsableDestination(null)).toBe(false);
    expect(
      isUsableDestination({ ...granby, label: "   " }),
    ).toBe(false);
    expect(
      isUsableDestination({
        ...granby,
        coordinates: { latitude: Number.NaN, longitude: -72 },
      }),
    ).toBe(false);
    expect(
      isUsableDestination({
        ...granby,
        coordinates: { latitude: 91, longitude: -72 },
      }),
    ).toBe(false);
  });

  it("labels each destination kind in French", () => {
    expect(destinationKindLabel(granby)).toBe("Adresse");
    expect(destinationKindLabel({ ...granby, kind: "city" })).toBe("Ville");
    expect(destinationKindLabel({ ...granby, kind: "postal_code" })).toBe(
      "Code postal",
    );
    expect(destinationKindLabel({ ...granby, kind: "place" })).toBe("Lieu");
    expect(destinationKindLabel({ ...granby, kind: undefined })).toBeNull();
  });

  it("summarizes a destination for the recap card", () => {
    const summary = destinationSummary(granby);
    expect(summary.primary).toBe("125 Rue Principale");
    expect(summary.secondary).toContain("Granby");
    expect(summary.secondary).toContain("Québec");
    expect(summary.secondary).toContain("Canada");
    expect(summary.kindLabel).toBe("Adresse");
    expect(summary.approximate).toBe(false);
    expect(summary.coordinatesLabel).toBe("45.40080, -72.73110");
  });

  it("flags an approximate destination", () => {
    const summary = destinationSummary({
      ...granby,
      kind: "postal_code",
      precision: "approximate",
    });
    expect(summary.approximate).toBe(true);
    expect(APPROXIMATE_DESTINATION_NOTICE).toContain("approximatif");
  });

  it("builds a map destination from a reverse-geocoded place", () => {
    const point = { latitude: 45.5, longitude: -72.5 };
    const destination = mapPointDestination(point, granby);

    expect(destination.source).toBe("map");
    // The picked point wins over whatever the geocoder echoed back.
    expect(destination.coordinates).toEqual(point);
    expect(destination.label).toBe(granby.label);
  });

  it("falls back to coordinates when reverse geocoding gives nothing", () => {
    const point = { latitude: 45.5, longitude: -72.5 };
    const destination = mapPointDestination(point, null);

    expect(destination.label).toBe(`${MAP_POINT_LABEL} (45.50000, -72.50000)`);
    expect(destination.name).toBe(MAP_POINT_LABEL);
    expect(destination.source).toBe("map");
    expect(isUsableDestination(destination)).toBe(true);
  });

  it("detects a destination that moved", () => {
    expect(hasMovedDestination(null, granby)).toBe(true);
    expect(hasMovedDestination(granby, granby)).toBe(false);
    expect(
      hasMovedDestination(granby, {
        ...granby,
        coordinates: { latitude: 46, longitude: -72.7311 },
      }),
    ).toBe(true);
  });
});
