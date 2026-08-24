import { describe, expect, it } from "vitest";
import { appearanceClassNames, resolveAppearance } from "./appearance";

describe("appearance (FR-037)", () => {
  it("follows the system preference unless overridden", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("night", false)).toBe("night");
  });

  it("applies night as a high-contrast dark variant", () => {
    expect(appearanceClassNames("night")).toEqual(["dark", "night"]);
    expect(appearanceClassNames("light")).toEqual([]);
  });
});
