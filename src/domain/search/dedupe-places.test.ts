import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import { dedupePlaces, placeSignature } from "./dedupe-places";

function street(latitude: number, longitude: number): Place {
  return {
    label: "Rue Principale, Granby, Québec, Canada",
    name: "Rue Principale",
    locality: "Granby",
    region: "Québec",
    country: "Canada",
    kind: "address",
    precision: "approximate",
    coordinates: { latitude, longitude },
  };
}

function city(region: string, country: string): Place {
  return {
    label: `Granby, ${region}, ${country}`,
    name: "Granby",
    locality: "Granby",
    region,
    country,
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 45.4, longitude: -72.73 },
  };
}

describe("dedupePlaces (FR-032)", () => {
  it("collapses the way segments of one street into a single offer", () => {
    const segments = [
      street(45.4008, -72.7311),
      street(45.4055, -72.7402),
      street(45.3971, -72.7255),
      street(45.4102, -72.7488),
      street(45.3922, -72.7199),
    ];

    const deduped = dedupePlaces(segments);

    expect(deduped).toHaveLength(1);
    // The first row survives, so the caller decides which one that is by
    // ordering the list beforehand.
    expect(deduped[0]?.coordinates).toEqual({
      latitude: 45.4008,
      longitude: -72.7311,
    });
  });

  it("keeps municipalities that share a name but not a region", () => {
    const places = [
      city("Québec", "Canada"),
      city("Vermont", "États-Unis"),
      city("Massachusetts", "États-Unis"),
    ];

    expect(dedupePlaces(places)).toHaveLength(3);
  });

  it("keeps two street numbers on the same street", () => {
    const places: Place[] = [
      {
        label: "125 Rue Principale, Granby, Québec, Canada",
        name: "125 Rue Principale",
        addressLine: "125 Rue Principale",
        locality: "Granby",
        region: "Québec",
        country: "Canada",
        kind: "address",
        precision: "exact",
        coordinates: { latitude: 45.4008, longitude: -72.7311 },
      },
      {
        label: "722 Rue Principale, Granby, Québec, Canada",
        name: "722 Rue Principale",
        addressLine: "722 Rue Principale",
        locality: "Granby",
        region: "Québec",
        country: "Canada",
        kind: "address",
        precision: "exact",
        coordinates: { latitude: 45.4055, longitude: -72.7402 },
      },
    ];

    expect(dedupePlaces(places)).toHaveLength(2);
  });

  it("keeps a municipality and a postal code that render the same way", () => {
    const places: Place[] = [
      city("Québec", "Canada"),
      { ...city("Québec", "Canada"), kind: "postal_code" },
    ];

    expect(dedupePlaces(places)).toHaveLength(2);
  });

  it("ignores accents, case and stray whitespace when comparing", () => {
    const places: Place[] = [
      city("Québec", "Canada"),
      { ...city("QUEBEC ", "Canada"), name: " granby " },
    ];

    expect(dedupePlaces(places)).toHaveLength(1);
  });

  it("is a no-op on an empty list", () => {
    expect(dedupePlaces([])).toEqual([]);
  });
});

describe("placeSignature", () => {
  it("falls back to the label when no explicit name is supplied", () => {
    const unnamed: Place = {
      label: "Granby, Québec, Canada",
      coordinates: { latitude: 45.4, longitude: -72.73 },
    };
    const named: Place = { ...unnamed, name: "Granby" };

    expect(placeSignature(unnamed)).toBe(placeSignature(named));
  });
});
