import { describe, expect, it } from "vitest";
import {
  placePrecisionLabel,
  placePrimaryName,
  placeSecondaryLine,
  placeTypeLabel,
} from "./place-display";

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

  it("shows province, postal code, country, type, and approximate precision", () => {
    const postal = {
      label: "J2G 2W4, Granby, Québec, Canada",
      name: "J2G 2W4",
      locality: "Granby",
      region: "Québec",
      postalCode: "J2G 2W4",
      country: "Canada",
      type: "postal_code" as const,
      precision: "approximate" as const,
      coordinates: { latitude: 45.4, longitude: -72.73 },
    };

    expect(placeSecondaryLine(postal)).toBe("Granby, Québec, Canada");
    expect(placeTypeLabel(postal)).toBe("Code postal");
    expect(placePrecisionLabel(postal)).toBe("Emplacement approximatif");
  });
});
