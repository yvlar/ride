import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("iOS Info.plist (FR-027, FR-028, NFR-006)", () => {
  const plist = readFileSync(
    path.join(process.cwd(), "ios/App/App/Info.plist"),
    "utf8",
  );
  const entitlements = readFileSync(
    path.join(process.cwd(), "ios/App/App/App.entitlements"),
    "utf8",
  );

  it("requests when-in-use location and no background location modes", () => {
    expect(plist).toContain("NSLocationWhenInUseUsageDescription");
    expect(plist).toContain("premier plan");
    expect(plist).not.toContain("<string>location</string>");
  });

  it("allows audio background only for CarPlay voice (FR-028, NFR-006)", () => {
    expect(plist).toContain("UIBackgroundModes");
    expect(plist).toContain("<string>audio</string>");
    expect(plist).not.toContain("<string>location</string>");
  });

  it("declares a CarPlay map scene (FR-028)", () => {
    expect(plist).toContain("CPTemplateApplicationSceneSessionRoleApplication");
    expect(plist).toContain("CarPlaySceneDelegate");
    expect(plist).toContain("UIApplicationSupportsMultipleScenes");
    expect(plist).toContain("<true/>");
  });

  it("requests the CarPlay maps entitlement without granting background GPS (FR-028)", () => {
    expect(entitlements).toContain("com.apple.developer.carplay-maps");
    expect(entitlements).not.toContain("com.apple.developer.location");
  });

  it("allows local HTTP for CAPACITOR_SERVER_URL without disabling ATS globally (FR-027)", () => {
    expect(plist).toContain("NSAllowsLocalNetworking");
    expect(plist).not.toContain("NSAllowsArbitraryLoads");
  });
});
