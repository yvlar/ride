import { describe, expect, it } from "vitest";
import {
  assertPostalCodeImportIsSane,
  MIN_EXPECTED_POSTAL_CODES,
  parseCkanPage,
  parseResourceUpdatedAt,
  parseSourceNumber,
  primaryQuebecPostalCodes,
  type QuebecSourceValidation,
  validateQuebecPostalCodeRows,
} from "./quebec-source";

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    CP: "J2G 2W4",
    LAT: 45.4008,
    LONG: -72.7331,
    NOM_MUN: "Granby",
    PRC_REP: 80,
    NB_UNITE_AD: 120,
    ...overrides,
  };
}

function validationOf(rows: unknown[]): QuebecSourceValidation {
  return validateQuebecPostalCodeRows(rows);
}

describe("parseCkanPage (FR-040)", () => {
  it("lit les enregistrements et le total", () => {
    const page = parseCkanPage({
      success: true,
      result: { total: 2, records: [sourceRow(), sourceRow()] },
    });

    expect(page.total).toBe(2);
    expect(page.records).toHaveLength(2);
  });

  it("refuse une réponse CKAN en échec ou malformée", () => {
    expect(() => parseCkanPage({ success: false })).toThrow(/CKAN/);
    expect(() => parseCkanPage({ success: true, result: {} })).toThrow(/CKAN/);
    expect(() =>
      parseCkanPage({ success: true, result: { total: "2", records: [] } }),
    ).toThrow(/CKAN/);
    expect(() => parseCkanPage(null)).toThrow(/CKAN/);
  });
});

describe("parseResourceUpdatedAt (FR-040)", () => {
  it("normalise la date de la ressource en ISO 8601", () => {
    expect(
      parseResourceUpdatedAt({
        result: { last_modified: "2026-05-14T10:20:30.123456" },
      }),
    ).toBe("2026-05-14T10:20:30.123Z");
  });

  it("retourne null quand la date est absente ou illisible", () => {
    expect(parseResourceUpdatedAt({ result: {} })).toBeNull();
    expect(parseResourceUpdatedAt({ result: { last_modified: "hier" } })).toBeNull();
    expect(parseResourceUpdatedAt(null)).toBeNull();
  });
});

describe("parseSourceNumber (FR-040)", () => {
  it("accepte les nombres, les chaînes et la virgule décimale", () => {
    expect(parseSourceNumber(45.4)).toBe(45.4);
    expect(parseSourceNumber("-72.7331")).toBe(-72.7331);
    expect(parseSourceNumber("45,4008")).toBe(45.4008);
    expect(parseSourceNumber(" 120 ")).toBe(120);
  });

  it("retourne null pour une valeur inexploitable", () => {
    expect(parseSourceNumber("")).toBeNull();
    expect(parseSourceNumber("n/d")).toBeNull();
    expect(parseSourceNumber(null)).toBeNull();
    expect(parseSourceNumber(Number.NaN)).toBeNull();
  });
});

describe("validateQuebecPostalCodeRows (FR-040)", () => {
  it("normalise le code postal et lit les colonnes sans dépendre de la casse", () => {
    const { records, rejectedRows } = validationOf([
      sourceRow(),
      { cp: "j0e1z0", lat: "45,4783", long: "-72,6819", nom_mun: "Roxton Pond" },
    ]);

    expect(rejectedRows).toBe(0);
    expect(records[0]?.postalCode).toBe("J2G2W4");
    expect(records[1]).toEqual({
      postalCode: "J0E1Z0",
      latitude: 45.4783,
      longitude: -72.6819,
      municipality: "Roxton Pond",
      representationPercent: null,
      addressUnits: null,
    });
  });

  it("rejette un code postal ou des coordonnées invalides", () => {
    const { records, rejectedRows } = validationOf([
      sourceRow({ CP: "123456" }),
      sourceRow({ CP: "" }),
      sourceRow({ LAT: 0, LONG: 0 }),
      sourceRow({ LAT: "n/d" }),
      sourceRow({ LAT: -72.7331, LONG: 45.4008 }),
      "pas un objet",
      sourceRow(),
    ]);

    expect(rejectedRows).toBe(6);
    expect(records).toHaveLength(1);
  });

  it("compte les lignes sans municipalité", () => {
    const validation = validationOf([
      sourceRow(),
      sourceRow({ CP: "J1H1A1", NOM_MUN: "   " }),
    ]);

    expect(validation.records).toHaveLength(2);
    expect(validation.rowsWithMunicipality).toBe(1);
  });
});

describe("primaryQuebecPostalCodes (FR-040)", () => {
  it("garde le territoire dont le PRC_REP est le plus élevé", () => {
    const primary = primaryQuebecPostalCodes(
      validationOf([
        sourceRow({ PRC_REP: 20, NOM_MUN: "Roxton Pond" }),
        sourceRow({ PRC_REP: 80, NOM_MUN: "Granby" }),
      ]),
    );

    expect(primary).toHaveLength(1);
    expect(primary[0]?.municipality).toBe("Granby");
  });
});

describe("assertPostalCodeImportIsSane (FR-040)", () => {
  /** Échantillon de lignes valides : seul le ratio de municipalités compte. */
  const SAMPLE_ROWS = 100;

  function sane(
    overrides: Partial<Parameters<typeof assertPostalCodeImportIsSane>[0]> = {},
  ) {
    const uniquePostalCodes =
      overrides.uniquePostalCodes ?? MIN_EXPECTED_POSTAL_CODES * 2;
    return {
      sourceRows: uniquePostalCodes,
      validation: {
        records: Array.from({ length: SAMPLE_ROWS }, () => ({
          postalCode: "J2G2W4",
          latitude: 45.4,
          longitude: -72.73,
          municipality: "Granby",
          representationPercent: 100,
          addressUnits: 10,
        })),
        rejectedRows: 0,
        rowsWithMunicipality: SAMPLE_ROWS,
      },
      uniquePostalCodes,
      existingBefore: uniquePostalCodes,
      ...overrides,
    };
  }

  it("accepte un import complet", () => {
    expect(() => assertPostalCodeImportIsSane(sane())).not.toThrow();
  });

  it("échoue quand la source ne retourne rien", () => {
    expect(() =>
      assertPostalCodeImportIsSane(
        sane({
          sourceRows: 0,
          validation: { records: [], rejectedRows: 0, rowsWithMunicipality: 0 },
          uniquePostalCodes: 0,
        }),
      ),
    ).toThrow(/aucun enregistrement/i);
  });

  it("échoue quand aucun code postal n’est valide", () => {
    expect(() =>
      assertPostalCodeImportIsSane(
        sane({
          sourceRows: 10,
          validation: { records: [], rejectedRows: 10, rowsWithMunicipality: 0 },
          uniquePostalCodes: 0,
        }),
      ),
    ).toThrow(/Aucun code postal valide/);
  });

  it("échoue quand le nombre de codes postaux est anormalement bas", () => {
    expect(() =>
      assertPostalCodeImportIsSane(
        sane({
          uniquePostalCodes: MIN_EXPECTED_POSTAL_CODES - 1,
          existingBefore: null,
        }),
      ),
    ).toThrow(/minimum attendu/);
  });

  it("échoue quand la municipalité manque trop souvent", () => {
    const base = sane();
    expect(() =>
      assertPostalCodeImportIsSane({
        ...base,
        validation: {
          ...base.validation,
          rowsWithMunicipality: Math.floor(base.validation.records.length / 2),
        },
      }),
    ).toThrow(/Municipalité absente/);
  });

  it("échoue quand la source couvre bien moins que la table existante", () => {
    expect(() =>
      assertPostalCodeImportIsSane(
        sane({
          uniquePostalCodes: MIN_EXPECTED_POSTAL_CODES * 2,
          existingBefore: MIN_EXPECTED_POSTAL_CODES * 10,
        }),
      ),
    ).toThrow(/déjà stockés/);
  });

  it("accepte un premier import dans une table vide", () => {
    expect(() =>
      assertPostalCodeImportIsSane(sane({ existingBefore: 0 })),
    ).not.toThrow();
  });
});
