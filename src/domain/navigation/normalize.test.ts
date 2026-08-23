import { describe, expect, it } from "vitest";
import { GENERIC_CONTINUE_INSTRUCTION } from "./constants";
import {
  normalizeManeuverModifier,
  normalizeManeuverType,
  normalizeNavigationStep,
  unknownManeuverFallbackInstruction,
} from "./normalize";

const geometry = {
  type: "LineString" as const,
  coordinates: [
    [-72.734, 45.403],
    [-72.73, 45.4],
  ],
} as const satisfies import("@/domain/geo/types").LineString;

describe("normalizeNavigationStep (FR-024)", () => {
  it("converts OSRM-like maneuver fields without exposing vendor types", () => {
    const step = normalizeNavigationStep(
      {
        type: "turn",
        modifier: "right",
        location: { latitude: 45.403, longitude: -72.734 },
        bearingBeforeDeg: 10,
        bearingAfterDeg: 95,
        name: "Route 112",
        ref: "112",
        destinations: "Waterloo",
        rotaryName: undefined,
        drivingSide: "right",
        distanceKm: 0.4,
        durationMinutes: 0.5,
        geometry,
      },
      1,
    );

    expect(step.maneuverType).toBe("turn");
    expect(step.modifier).toBe("right");
    expect(step.ref).toBe("112");
    expect(step.destinations).toBe("Waterloo");
    expect(step.bearingBeforeDeg).toBe(10);
    expect(step.bearingAfterDeg).toBe(95);
  });

  it("maps depart, arrive, turn, fork, ramp and roundabout (FR-024)", () => {
    expect(normalizeManeuverType("depart")).toBe("depart");
    expect(normalizeManeuverType("arrive")).toBe("arrive");
    expect(normalizeManeuverType("turn")).toBe("turn");
    expect(normalizeManeuverType("fork")).toBe("fork");
    expect(normalizeManeuverType("on ramp")).toBe("on_ramp");
    expect(normalizeManeuverType("off ramp")).toBe("off_ramp");
    expect(normalizeManeuverType("roundabout")).toBe("roundabout");
    expect(normalizeManeuverType("rotary")).toBe("roundabout");
    expect(normalizeManeuverType("exit roundabout")).toBe("roundabout");
    expect(normalizeManeuverModifier("sharp left")).toBe("sharp_left");
  });

  it("treats an unknown OSRM type as a safe continue fallback (FR-024)", () => {
    const step = normalizeNavigationStep(
      {
        type: "quantum-leap",
        modifier: "sideways",
        name: "Chemin perdu",
        distanceKm: 1,
        durationMinutes: 1,
        geometry,
      },
      0,
    );

    expect(step.maneuverType).toBe("unknown");
    expect(step.modifier).toBe("unknown");
    expect(step.name).toBe("Chemin perdu");
    expect(unknownManeuverFallbackInstruction()).toBe(
      GENERIC_CONTINUE_INSTRUCTION,
    );
  });

  it("does not fail when maneuver fields are missing", () => {
    const step = normalizeNavigationStep(
      {
        distanceKm: 2,
        durationMinutes: 3,
        geometry,
      },
      2,
    );

    expect(step.maneuverType).toBe("continue");
    expect(step.location).toEqual({ latitude: 45.403, longitude: -72.734 });
  });

  it("promotes a turn with uturn modifier to a uturn maneuver", () => {
    const step = normalizeNavigationStep(
      {
        type: "turn",
        modifier: "uturn",
        distanceKm: 0.1,
        durationMinutes: 0.2,
        geometry,
      },
      0,
    );
    expect(step.maneuverType).toBe("uturn");
  });
});
