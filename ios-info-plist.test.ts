import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("iOS Info.plist (FR-027, NFR-006)", () => {
  const plist = readFileSync(
    path.join(process.cwd(), "ios/App/App/Info.plist"),
    "utf8",
  );

  it("requests when-in-use location and no background location modes", () => {
    expect(plist).toContain("NSLocationWhenInUseUsageDescription");
    expect(plist).toContain("premier plan");
    expect(plist).not.toContain("UIBackgroundModes");
  });
});
