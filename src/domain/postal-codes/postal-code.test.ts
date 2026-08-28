import { describe, expect, it } from "vitest";
import { placePrimaryName, placeSecondaryLine } from "@/domain/geo/place-display";
import { postalCodePlace } from "./postal-code";

describe("postalCodePlace (FR-040, FR-032)", () => {
  it("produit une destination lisible avec ses coordonnées", () => {
    const place = postalCodePlace({
      postalCode: "J2G2W4",
      latitude: 45.4008,
      longitude: -72.7331,
      municipality: "Granby",
      region: "QC",
    });

    expect(place).toEqual({
      label: "J2G 2W4, Granby, QC",
      coordinates: { latitude: 45.4008, longitude: -72.7331 },
      name: "J2G 2W4",
      locality: "Granby",
      region: "QC",
      // FR-038 — the reference base gives a real point, not a zone centroid.
      kind: "postal_code",
      precision: "exact",
      source: "search",
      postalCode: "J2G 2W4",
    });
  });

  it("s’affiche comme les autres résultats de recherche", () => {
    const place = postalCodePlace({
      postalCode: "J1H1A1",
      latitude: 45.4022,
      longitude: -71.8887,
      municipality: "Sherbrooke",
      region: "QC",
    });

    expect(placePrimaryName(place)).toBe("J1H 1A1");
    expect(placeSecondaryLine(place)).toBe("Sherbrooke, QC");
  });

  it("reste valide sans région ni municipalité", () => {
    const place = postalCodePlace({
      postalCode: "J0E1Z0",
      latitude: 45.4783,
      longitude: -72.6819,
      municipality: "  ",
    });

    expect(place.label).toBe("J0E 1Z0");
    expect(place.locality).toBeUndefined();
    expect(place.region).toBeUndefined();
  });
});
