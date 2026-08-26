import { describe, expect, it } from "vitest";
import {
  deduplicatePostalCodeRecords,
  selectPrimaryPostalCodeRecord,
  type PostalCodeRecord,
} from "./deduplicate-postal-codes";

function record(overrides: Partial<PostalCodeRecord> = {}): PostalCodeRecord {
  return {
    postalCode: "J2G2W4",
    latitude: 45.4,
    longitude: -72.73,
    municipality: "Granby",
    representationPercent: 50,
    addressUnits: 10,
    ...overrides,
  };
}

describe("selectPrimaryPostalCodeRecord (FR-040)", () => {
  it("retient le PRC_REP le plus élevé", () => {
    const primary = selectPrimaryPostalCodeRecord([
      record({ representationPercent: 12.5, municipality: "Roxton Pond" }),
      record({ representationPercent: 87.5, municipality: "Granby" }),
      record({ representationPercent: 40, municipality: "Waterloo" }),
    ]);

    expect(primary?.municipality).toBe("Granby");
    expect(primary?.representationPercent).toBe(87.5);
  });

  it("départage une égalité de PRC_REP par NB_UNITE_AD", () => {
    const primary = selectPrimaryPostalCodeRecord([
      record({
        representationPercent: 50,
        addressUnits: 4,
        municipality: "Roxton Pond",
      }),
      record({
        representationPercent: 50,
        addressUnits: 120,
        municipality: "Granby",
      }),
    ]);

    expect(primary?.municipality).toBe("Granby");
  });

  it("reste déterministe lorsque l’égalité subsiste", () => {
    const candidates = [
      record({
        representationPercent: 50,
        addressUnits: 10,
        municipality: "Waterloo",
      }),
      record({
        representationPercent: 50,
        addressUnits: 10,
        municipality: "Granby",
      }),
    ];

    expect(selectPrimaryPostalCodeRecord(candidates)?.municipality).toBe(
      "Granby",
    );
    expect(selectPrimaryPostalCodeRecord([...candidates].reverse())?.municipality).toBe(
      "Granby",
    );
  });

  it("préfère une valeur connue à une valeur absente", () => {
    const primary = selectPrimaryPostalCodeRecord([
      record({ representationPercent: null, municipality: "Roxton Pond" }),
      record({ representationPercent: 1, municipality: "Granby" }),
    ]);

    expect(primary?.municipality).toBe("Granby");
  });

  it("retourne null pour un groupe vide", () => {
    expect(selectPrimaryPostalCodeRecord([])).toBeNull();
  });
});

describe("deduplicatePostalCodeRecords (FR-040)", () => {
  it("conserve une seule destination par code postal, triée", () => {
    const deduplicated = deduplicatePostalCodeRecords([
      record({ postalCode: "J1H1A1", municipality: "Sherbrooke" }),
      record({
        postalCode: "J2G2W4",
        representationPercent: 20,
        municipality: "Roxton Pond",
      }),
      record({
        postalCode: "J2G2W4",
        representationPercent: 80,
        municipality: "Granby",
      }),
    ]);

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated.map((entry) => entry.postalCode)).toEqual([
      "J1H1A1",
      "J2G2W4",
    ]);
    expect(deduplicated[1]?.municipality).toBe("Granby");
  });

  it("ne choisit jamais la première ligne par défaut", () => {
    const [primary] = deduplicatePostalCodeRecords([
      record({ representationPercent: 1, municipality: "Roxton Pond" }),
      record({ representationPercent: 99, municipality: "Granby" }),
    ]);

    expect(primary?.municipality).toBe("Granby");
  });
});
