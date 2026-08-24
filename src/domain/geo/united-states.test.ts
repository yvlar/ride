import { describe, expect, it } from "vitest";
import {
  geometryEntersUnitedStates,
  isInUnitedStates,
} from "./united-states";

const CANADA = {
  windsor: { latitude: 42.3149, longitude: -83.0365 },
  niagaraOnTheLake: { latitude: 43.2554, longitude: -79.0712 },
  whiteRock: { latitude: 49.0253, longitude: -122.8029 },
  stanstead: { latitude: 45.0167, longitude: -72.0972 },
  stStephen: { latitude: 45.1944, longitude: -67.2778 },
  granby: { latitude: 45.403, longitude: -72.734 },
  toronto: { latitude: 43.6532, longitude: -79.3832 },
  vancouver: { latitude: 49.2827, longitude: -123.1207 },
  victoria: { latitude: 48.4284, longitude: -123.3656 },
  whitehorse: { latitude: 60.7212, longitude: -135.0568 },
} as const;

const UNITED_STATES = {
  detroit: { latitude: 42.3314, longitude: -83.0458 },
  buffalo: { latitude: 42.8864, longitude: -78.8784 },
  burlington: { latitude: 44.4759, longitude: -73.2121 },
  seattle: { latitude: 47.6062, longitude: -122.3321 },
  anchorage: { latitude: 61.2181, longitude: -149.9003 },
  boston: { latitude: 42.3601, longitude: -71.0589 },
} as const;

describe("isInUnitedStates (FR-028)", () => {
  it("keeps Canadian border towns outside the United States", () => {
    for (const [name, point] of Object.entries(CANADA)) {
      expect(isInUnitedStates(point), name).toBe(false);
    }
  });

  it("classifies United States cities, including Alaska, as inside", () => {
    for (const [name, point] of Object.entries(UNITED_STATES)) {
      expect(isInUnitedStates(point), name).toBe(true);
    }
  });
});

describe("geometryEntersUnitedStates (FR-028)", () => {
  it("detects a Canadian corridor that dips into the United States", () => {
    expect(
      geometryEntersUnitedStates({
        type: "LineString",
        coordinates: [
          [CANADA.windsor.longitude, CANADA.windsor.latitude],
          [UNITED_STATES.detroit.longitude, UNITED_STATES.detroit.latitude],
          [CANADA.windsor.longitude, CANADA.windsor.latitude],
        ],
      }),
    ).toBe(true);
  });

  it("accepts a geometry that stays in Canada", () => {
    expect(
      geometryEntersUnitedStates({
        type: "LineString",
        coordinates: [
          [CANADA.granby.longitude, CANADA.granby.latitude],
          [CANADA.toronto.longitude, CANADA.toronto.latitude],
          [CANADA.granby.longitude, CANADA.granby.latitude],
        ],
      }),
    ).toBe(false);
  });
});
