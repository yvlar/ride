import { describe, expect, it } from "vitest";
import {
  formatCanadianPostalCode,
  isCanadianPostalCode,
  normalizeCanadianPostalCode,
} from "./normalize-postal-code";

describe("normalizeCanadianPostalCode (FR-040)", () => {
  it("retire les espaces, les tirets et la casse", () => {
    expect(normalizeCanadianPostalCode("J2G 2W4")).toBe("J2G2W4");
    expect(normalizeCanadianPostalCode("J2G2W4")).toBe("J2G2W4");
    expect(normalizeCanadianPostalCode("j2g 2w4")).toBe("J2G2W4");
    expect(normalizeCanadianPostalCode(" J2G 2W4 ")).toBe("J2G2W4");
    expect(normalizeCanadianPostalCode("j2g-2w4")).toBe("J2G2W4");
    expect(normalizeCanadianPostalCode("J2G\u00A02W4")).toBe("J2G2W4");
  });

  it("rejette ce qui n’est pas un code postal canadien plausible", () => {
    expect(normalizeCanadianPostalCode("123456")).toBeNull();
    expect(normalizeCanadianPostalCode("ABCDEF")).toBeNull();
    expect(normalizeCanadianPostalCode("")).toBeNull();
    expect(normalizeCanadianPostalCode("   ")).toBeNull();
    expect(normalizeCanadianPostalCode("Granby")).toBeNull();
    expect(normalizeCanadianPostalCode("J2G 2W")).toBeNull();
    expect(normalizeCanadianPostalCode("J2G 2W45")).toBeNull();
    // D, F, I, O, Q et U ne sont jamais utilisées par Postes Canada.
    expect(normalizeCanadianPostalCode("D2G 2W4")).toBeNull();
    expect(normalizeCanadianPostalCode("J2G 2O4")).toBeNull();
    // W et Z ne peuvent pas ouvrir un code postal.
    expect(normalizeCanadianPostalCode("W2G 2W4")).toBeNull();
  });
});

describe("isCanadianPostalCode (FR-040)", () => {
  it("accepte un code postal complet, quelle que soit sa forme", () => {
    expect(isCanadianPostalCode("J2G2W4")).toBe(true);
    expect(isCanadianPostalCode("J2G 2W4")).toBe(true);
  });

  it("refuse une saisie partielle ou une chaîne quelconque", () => {
    expect(isCanadianPostalCode("J2G")).toBe(false);
    expect(isCanadianPostalCode("J2G 2")).toBe(false);
    expect(isCanadianPostalCode("123456")).toBe(false);
    expect(isCanadianPostalCode("ABCDEF")).toBe(false);
    expect(isCanadianPostalCode("")).toBe(false);
  });
});

describe("formatCanadianPostalCode (FR-040)", () => {
  it("affiche la forme lisible avec une espace", () => {
    expect(formatCanadianPostalCode("j2g2w4")).toBe("J2G 2W4");
    expect(formatCanadianPostalCode("J2G 2W4")).toBe("J2G 2W4");
  });

  it("retourne null pour une chaîne invalide", () => {
    expect(formatCanadianPostalCode("123456")).toBeNull();
  });
});
