import { describe, expect, it } from "vitest";
import { GENERIC_CONTINUE_INSTRUCTION } from "./constants";
import { formatFrenchInstruction } from "./instructions";
import type { NavigationStep } from "./types";

const geometry = {
  type: "LineString" as const,
  coordinates: [
    [-72.7, 45.4],
    [-72.69, 45.4],
  ],
} as const satisfies import("@/domain/geo/types").LineString;

function step(partial: Partial<NavigationStep>): NavigationStep {
  return {
    id: "step:0:turn",
    maneuverType: "turn",
    modifier: "right",
    location: { latitude: 45.4, longitude: -72.7 },
    distanceKm: 0.5,
    durationMinutes: 0.6,
    geometry,
    ...partial,
  };
}

describe("formatFrenchInstruction (FR-025)", () => {
  it("formats a right turn onto a numbered road", () => {
    expect(
      formatFrenchInstruction(step({ ref: "112", name: "Route 112" })),
    ).toBe("Tournez à droite sur Route 112.");
  });

  it("formats a numbered ref without repeating the name", () => {
    expect(formatFrenchInstruction(step({ ref: "112" }))).toBe(
      "Tournez à droite sur la route 112.",
    );
  });

  it("formats a roundabout exit in French", () => {
    expect(
      formatFrenchInstruction(
        step({
          maneuverType: "roundabout",
          modifier: "right",
          exit: 2,
        }),
      ),
    ).toBe("Au rond-point, prenez la deuxième sortie.");
  });

  it("formats an on-ramp toward a destination", () => {
    expect(
      formatFrenchInstruction(
        step({
          maneuverType: "on_ramp",
          destinations: "Montréal",
        }),
      ),
    ).toBe("Prenez la bretelle vers Montréal.");
  });

  it("formats a straight continuation with distance", () => {
    expect(
      formatFrenchInstruction(
        step({
          maneuverType: "continue",
          modifier: "straight",
          distanceKm: 2,
        }),
      ),
    ).toBe("Continuez tout droit pendant 2 kilomètres.");
  });

  it("formats arrival", () => {
    expect(
      formatFrenchInstruction(step({ maneuverType: "arrive" })),
    ).toBe("Vous êtes arrivé à destination.");
  });

  it("uses the generic fallback for an unknown maneuver", () => {
    expect(
      formatFrenchInstruction(step({ maneuverType: "unknown" })),
    ).toBe(GENERIC_CONTINUE_INSTRUCTION);
  });
});
