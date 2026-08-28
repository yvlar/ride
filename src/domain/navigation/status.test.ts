import { describe, expect, it } from "vitest";
import {
  deriveNavigationStatus,
  NAVIGATION_STATUS_MESSAGES,
  type NavigationStatusInput,
} from "./status";

function input(
  overrides: Partial<NavigationStatusInput> = {},
): NavigationStatusInput {
  return {
    hasFix: true,
    suspended: false,
    online: true,
    recalculating: false,
    offRoute: false,
    gpsErrorCode: null,
    accuracyMeters: 8,
    errorMessage: null,
    arrived: false,
    ...overrides,
  };
}

describe("deriveNavigationStatus (FR-042)", () => {
  it("stays quiet while everything is nominal", () => {
    const status = deriveNavigationStatus(input());
    expect(status.phase).toBe("navigating");
    expect(status.message).toBe("");
  });

  it("asks for the position before the first fix", () => {
    expect(deriveNavigationStatus(input({ hasFix: false }))).toMatchObject({
      phase: "locating",
      message: NAVIGATION_STATUS_MESSAGES.locating,
    });
  });

  it("names a weak GPS signal instead of silently freezing the maneuver", () => {
    expect(
      deriveNavigationStatus(input({ accuracyMeters: 250 })),
    ).toMatchObject({
      phase: "weak_gps",
      message: NAVIGATION_STATUS_MESSAGES.weakGps,
    });
  });

  it("reports leaving the route and then the recalculation", () => {
    expect(deriveNavigationStatus(input({ offRoute: true }))).toMatchObject({
      phase: "off_route",
      message: NAVIGATION_STATUS_MESSAGES.offRoute,
    });
    expect(
      deriveNavigationStatus(input({ offRoute: true, recalculating: true })),
    ).toMatchObject({
      phase: "recalculating",
      message: NAVIGATION_STATUS_MESSAGES.recalculating,
    });
  });

  it("reports a lost connection without dropping the route", () => {
    expect(deriveNavigationStatus(input({ online: false }))).toMatchObject({
      phase: "offline",
      message: NAVIGATION_STATUS_MESSAGES.offline,
    });
  });

  it("puts a denied permission above every other signal", () => {
    const status = deriveNavigationStatus(
      input({
        gpsErrorCode: "PERMISSION_DENIED",
        suspended: true,
        recalculating: true,
        online: false,
      }),
    );
    expect(status.phase).toBe("gps_denied");
    expect(status.tone).toBe("danger");
  });

  it("ranks suspension above a recalculation, and a hard error above both", () => {
    expect(
      deriveNavigationStatus(input({ suspended: true, recalculating: true })),
    ).toMatchObject({ phase: "suspended" });
    expect(
      deriveNavigationStatus(
        input({ recalculating: true, errorMessage: "Réseau indisponible." }),
      ),
    ).toMatchObject({ phase: "error", message: "Réseau indisponible." });
  });

  it("degrades a GPS drop-out to a recoverable warning", () => {
    expect(
      deriveNavigationStatus(input({ gpsErrorCode: "POSITION_UNAVAILABLE" })),
    ).toMatchObject({
      phase: "gps_lost",
      tone: "warning",
      message: NAVIGATION_STATUS_MESSAGES.gpsLost,
    });
  });

  it("announces arrival once the rider is there", () => {
    expect(deriveNavigationStatus(input({ arrived: true }))).toMatchObject({
      phase: "arrived",
      message: NAVIGATION_STATUS_MESSAGES.arrived,
    });
  });

  it("gives every phase a sentence, so no state is colour-only", () => {
    const cases: Partial<NavigationStatusInput>[] = [
      { hasFix: false },
      { suspended: true },
      { online: false },
      { recalculating: true },
      { offRoute: true },
      { gpsErrorCode: "PERMISSION_DENIED" },
      { gpsErrorCode: "TIMEOUT" },
      { accuracyMeters: 500 },
      { arrived: true },
      { errorMessage: "Boum." },
    ];
    for (const override of cases) {
      expect(deriveNavigationStatus(input(override)).message.length).
        toBeGreaterThan(0);
    }
  });
});
