import { describe, expect, it } from "vitest";
import type { Place } from "./types";
import { placePrimaryName, placeSecondaryLine } from "./place-display";

describe("place display (FR-032)", () => {
  it("uses the explicit name and address to distinguish similar places", () => {
    const church = {
      label: "Église Saint-Joseph, 12 Rue Principale, Granby, Québec",
      name: "Église Saint-Joseph",
      addressLine: "12 Rue Principale",
      locality: "Granby",
      region: "Québec",
      coordinates: { latitude: 45.4, longitude: -72.73 },
    };
    expect(placePrimaryName(church)).toBe("Église Saint-Joseph");
    expect(placeSecondaryLine(church)).toBe("12 Rue Principale, Granby, Québec");
  });

  it("falls back to the label when structured fields are absent", () => {
    const granby = {
      label: "Granby, QC",
      coordinates: { latitude: 45.4, longitude: -72.73 },
    };
    expect(placePrimaryName(granby)).toBe("Granby");
    expect(placeSecondaryLine(granby)).toBe("QC");
  });
});
describe("same-name places (FR-032, FR-038)", () => {
  it("separates two municipalities sharing a name by region and country", () => {
    const granbyQc: Place = {
      label: "Granby, Québec, Canada",
      name: "Granby",
      locality: "Granby",
      region: "Québec",
      country: "Canada",
      coordinates: { latitude: 45.4001, longitude: -72.7342 },
    };
    const granbyCo: Place = {
      label: "Granby, Colorado, États-Unis",
      name: "Granby",
      locality: "Granby",
      region: "Colorado",
      country: "États-Unis",
      coordinates: { latitude: 40.0866, longitude: -105.9372 },
    };

    expect(placePrimaryName(granbyQc)).toBe(placePrimaryName(granbyCo));
    // The primary name alone is ambiguous, so the secondary line must not be.
    expect(placeSecondaryLine(granbyQc)).not.toBe(placeSecondaryLine(granbyCo));
    expect(placeSecondaryLine(granbyQc)).toBe("Québec, Canada");
    expect(placeSecondaryLine(granbyCo)).toBe("Colorado, États-Unis");
  });

  it("keeps the country on a full address", () => {
    const address: Place = {
      label: "125 Rue Principale, Granby, Québec, Canada",
      name: "125 Rue Principale",
      addressLine: "125 Rue Principale",
      locality: "Granby",
      region: "Québec",
      country: "Canada",
      coordinates: { latitude: 45.4008, longitude: -72.7311 },
    };

    expect(placeSecondaryLine(address)).toBe("Granby, Québec, Canada");
  });
});
