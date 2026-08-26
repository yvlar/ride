import { describe, expect, it } from "vitest";
import {
  normalizeCanadianPostalCode,
  normalizeGeocodingQuery,
} from "./canadian-postal-code";

describe("Canadian postal codes", () => {
  it.each([
    ["J2G2W4", "J2G 2W4"],
    ["j2g 2w4", "J2G 2W4"],
    [" J2G  2W4 ", "J2G 2W4"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeCanadianPostalCode(input)).toBe(expected);
    expect(normalizeGeocodingQuery(input)).toBe(expected);
  });

  it("leaves a normal place query unchanged", () => {
    expect(normalizeCanadianPostalCode("Roxton Pond")).toBeNull();
    expect(normalizeGeocodingQuery("  Roxton Pond  ")).toBe("Roxton Pond");
  });

  it("rejects letters that Canadian postal codes do not use", () => {
    expect(normalizeCanadianPostalCode("D2G 2W4")).toBeNull();
  });
});
