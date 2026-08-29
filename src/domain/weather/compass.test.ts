import { describe, expect, it } from "vitest";
import {
  COMPASS_SECTORS,
  compassSector,
  compassSectorBearingDeg,
  compassSectorLabel,
  wrapBearingDeg,
} from "./compass";

describe("compassSector (FR-043)", () => {
  it("names the eight directions from their own bearing", () => {
    for (const sector of COMPASS_SECTORS) {
      expect(compassSector(compassSectorBearingDeg(sector))).toBe(sector);
    }
  });

  it("puts the boundary between two names, not on one", () => {
    expect(compassSector(22)).toBe("N");
    expect(compassSector(23)).toBe("NE");
    expect(compassSector(337)).toBe("NO");
    expect(compassSector(338)).toBe("N");
  });

  it("wraps a bearing past a full turn or below zero", () => {
    expect(wrapBearingDeg(365)).toBe(5);
    expect(wrapBearingDeg(-90)).toBe(270);
    expect(compassSector(-90)).toBe("O");
    expect(compassSector(360)).toBe("N");
  });

  it("labels each sector in French", () => {
    expect(compassSectorLabel("SO")).toBe("sud-ouest");
    expect(compassSectorLabel("NE")).toBe("nord-est");
  });
});
