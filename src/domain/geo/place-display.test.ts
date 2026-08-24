import { describe, expect, it } from "vitest";
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
