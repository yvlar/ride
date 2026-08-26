import { describe, expect, it } from "vitest";
import {
  formatCanadianPostalCode,
  isCanadianPostalCode,
  parseCanadianPostalCode,
  parseForwardSortationArea,
} from "./postal-code";

describe("Canadian postal codes (FR-038)", () => {
  it("normalizes a postal code typed with or without a space, in any case", () => {
    for (const input of ["J2G2W4", "j2g 2w4", "J2G 2W4", " j2g2w4 ", "J2G-2W4"]) {
      expect(parseCanadianPostalCode(input)).toEqual({
        normalized: "J2G 2W4",
        fsa: "J2G",
      });
      expect(formatCanadianPostalCode(input)).toBe("J2G 2W4");
    }
  });

  it("rejects letters Postes Canada never uses", () => {
    // D, F, I, O, Q and U are excluded everywhere.
    for (const input of ["D2G 2W4", "J2D 2W4", "J2G 2O4"]) {
      expect(parseCanadianPostalCode(input)).toBeNull();
    }
    // W and Z are excluded from the first position only.
    expect(parseCanadianPostalCode("W2G 2W4")).toBeNull();
    expect(parseCanadianPostalCode("Z2G 2W4")).toBeNull();
    expect(parseCanadianPostalCode("J2W 2W4")).not.toBeNull();
  });

  it("rejects anything that is not a full postal code", () => {
    for (const input of ["Granby", "J2G", "12345", "J2G 2W", "J2G 2W45"]) {
      expect(isCanadianPostalCode(input)).toBe(false);
    }
  });

  it("parses a bare forward sortation area", () => {
    expect(parseForwardSortationArea("j2g")).toBe("J2G");
    expect(parseForwardSortationArea("J2G 2W4")).toBeNull();
    expect(parseForwardSortationArea("Magog")).toBeNull();
  });

  it("leaves a non-Canadian code untouched when formatting", () => {
    expect(formatCanadianPostalCode("75008")).toBe("75008");
  });
});
