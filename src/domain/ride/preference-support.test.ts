import { describe, expect, it } from "vitest";
import {
  ROUTE_PREFERENCE_SUPPORT,
  supportedRoutePreferenceKeys,
} from "./preference-support";

describe("route preference support (FR-007, FR-008, FR-030)", () => {
  it("does not advertise tolls or ferries as enforceable", () => {
    const tolls = ROUTE_PREFERENCE_SUPPORT.find((item) => item.key === "avoidTolls");
    const ferries = ROUTE_PREFERENCE_SUPPORT.find(
      (item) => item.key === "avoidFerries",
    );
    expect(tolls?.supported).toBe(false);
    expect(ferries?.supported).toBe(false);
    expect(supportedRoutePreferenceKeys()).toEqual([
      "avoidHighways",
      "avoidUnpaved",
      "allowUnpaved",
      "stayInCanada",
    ]);
  });
});
