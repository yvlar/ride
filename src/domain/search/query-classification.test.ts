import { describe, expect, it } from "vitest";
import {
  classifyDestinationQuery,
  parseForwardSortationArea,
} from "./query-classification";

describe("destination query classification (FR-038)", () => {
  it("recognizes a full postal code however it is typed", () => {
    expect(classifyDestinationQuery("j2g 2w4")).toEqual({
      kind: "postal_code",
      normalized: "J2G 2W4",
      fsa: "J2G",
      areaOnly: false,
    });
    expect(classifyDestinationQuery("J2G2W4")).toMatchObject({
      kind: "postal_code",
      normalized: "J2G 2W4",
    });
  });

  it("recognizes a bare forward sortation area as an area query", () => {
    expect(classifyDestinationQuery("J2G")).toEqual({
      kind: "postal_code",
      normalized: "J2G",
      fsa: "J2G",
      areaOnly: true,
    });
  });

  it("rejects letters Postes Canada never uses", () => {
    // D, F, I, O, Q and U are excluded everywhere; W and Z cannot open a code.
    for (const query of ["D2G 2W4", "J2D 2W4", "J2G 2O4", "W2G 2W4", "Z2G 2W4"]) {
      expect(classifyDestinationQuery(query)).toEqual({
        kind: "free_text",
        query,
      });
    }
    expect(classifyDestinationQuery("J2W 2W4").kind).toBe("postal_code");
  });

  it("parses a bare forward sortation area", () => {
    expect(parseForwardSortationArea("j2g")).toBe("J2G");
    expect(parseForwardSortationArea("J2G 2W4")).toBeNull();
    expect(parseForwardSortationArea("Magog")).toBeNull();
  });

  it("treats an address, a city and a place as free text", () => {
    for (const query of [
      "125 rue Principale, Granby, Québec",
      "Roxton Pond",
      "Sherbrooke, QC",
      "Parc national du Mont-Orford",
    ]) {
      expect(classifyDestinationQuery(query)).toEqual({
        kind: "free_text",
        query,
      });
    }
  });
});
