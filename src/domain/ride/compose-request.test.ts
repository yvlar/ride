import { describe, expect, it } from "vitest";
import { composeRideRequest } from "./compose-request";
import type { RideFormInput } from "./types";

const granby = {
  label: "Granby",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const tremblant = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.1185, longitude: -74.5962 },
};

const preferences = { avoidHighways: true, avoidUnpaved: true };

function baseInput(
  overrides: Partial<RideFormInput> = {},
): RideFormInput {
  return {
    start: granby,
    type: "loop",
    destination: null,
    targetDistanceKm: 200,
    availableDurationMinutes: null,
    style: "scenic",
    preferences,
    ...overrides,
  };
}

describe("composeRideRequest (FR-014)", () => {
  it("requires a start place (FR-017)", () => {
    const result = composeRideRequest(baseInput({ start: null }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      field: "start",
      message: "Indiquez un point de départ.",
    });
  });

  it("requires a destination for destination rides (FR-018)", () => {
    const result = composeRideRequest(
      baseInput({ type: "destination", destination: null }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      field: "destination",
      message: "Indiquez une destination.",
    });
  });

  it("requires a destination for round trips (FR-018)", () => {
    const result = composeRideRequest(
      baseInput({ type: "round_trip", destination: null }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        {
          field: "destination",
          message: "Indiquez une destination.",
        },
      ]),
    );
  });

  it("requires a distance or duration for a loop (FR-001, FR-009, FR-010)", () => {
    const result = composeRideRequest(
      baseInput({ targetDistanceKm: null, availableDurationMinutes: null }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      field: "targetDistanceKm",
      message:
        "Indiquez une distance cible ou une durée disponible pour une boucle.",
    });
  });

  it("composes a loop with an explicit target distance (FR-001, FR-009)", () => {
    const result = composeRideRequest(baseInput());

    expect(result).toEqual({
      ok: true,
      request: {
        type: "loop",
        start: granby,
        targetDistanceKm: 200,
        availableDurationMinutes: undefined,
        style: "scenic",
        preferences,
      },
    });
  });

  it("keeps a duration-only loop without inventing an explicit distance (FR-010)", () => {
    const result = composeRideRequest(
      baseInput({
        targetDistanceKm: null,
        availableDurationMinutes: 180,
        style: "curvy",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.type).toBe("loop");
    if (result.request.type !== "loop") return;
    expect(result.request.targetDistanceKm).toBeUndefined();
    expect(result.request.availableDurationMinutes).toBe(180);
  });

  it("keeps explicit distance as the primary length when duration is also set (FR-010)", () => {
    const result = composeRideRequest(
      baseInput({
        targetDistanceKm: 250,
        availableDurationMinutes: 240,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.targetDistanceKm).toBe(250);
    expect(result.request.availableDurationMinutes).toBe(240);
  });

  it("accepts an optional target distance for a destination ride (FR-009)", () => {
    const result = composeRideRequest(
      baseInput({
        type: "destination",
        destination: tremblant,
        targetDistanceKm: 220,
        availableDurationMinutes: null,
        style: "scenic",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toMatchObject({
      type: "destination",
      targetDistanceKm: 220,
    });
  });

  it("composes a round trip without requiring distance (FR-003, FR-009)", () => {
    const result = composeRideRequest(
      baseInput({
        type: "round_trip",
        destination: tremblant,
        targetDistanceKm: null,
        availableDurationMinutes: null,
        style: "touring",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.targetDistanceKm).toBeUndefined();
  });

  it("composes a destination ride without requiring distance (FR-002, FR-009)", () => {
    const result = composeRideRequest(
      baseInput({
        type: "destination",
        destination: tremblant,
        targetDistanceKm: null,
        availableDurationMinutes: null,
        style: "curvy",
      }),
    );

    expect(result).toEqual({
      ok: true,
      request: {
        type: "destination",
        start: granby,
        destination: tremblant,
        targetDistanceKm: undefined,
        availableDurationMinutes: undefined,
        style: "curvy",
        preferences,
      },
    });
  });

  it("composes a round trip with preferences (FR-003, FR-007, FR-008)", () => {
    const result = composeRideRequest(
      baseInput({
        type: "round_trip",
        destination: tremblant,
        targetDistanceKm: 400,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toMatchObject({
      type: "round_trip",
      start: granby,
      destination: tremblant,
      targetDistanceKm: 400,
      preferences: { avoidHighways: true, avoidUnpaved: true },
    });
  });

  it("rejects a non-positive distance", () => {
    const result = composeRideRequest(baseInput({ targetDistanceKm: 0 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      field: "targetDistanceKm",
      message: "La distance cible doit être supérieure à 0 km.",
    });
  });

  it("rejects a non-positive available duration (FR-010)", () => {
    const result = composeRideRequest(
      baseInput({ availableDurationMinutes: 0 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      field: "availableDurationMinutes",
      message: "La durée disponible doit être supérieure à 0.",
    });
  });

  it("accepts an optional duration for a destination ride (FR-010)", () => {
    const result = composeRideRequest(
      baseInput({
        type: "destination",
        destination: tremblant,
        targetDistanceKm: null,
        availableDurationMinutes: 90,
        style: "touring",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toMatchObject({
      type: "destination",
      availableDurationMinutes: 90,
      targetDistanceKm: undefined,
    });
  });
});
