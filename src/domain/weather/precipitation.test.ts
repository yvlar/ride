import { describe, expect, it } from "vitest";
import {
  isWetLevel,
  precipitationLevel,
  precipitationLevelLabel,
  precipitationRisk,
} from "./precipitation";
import type { WeatherSample } from "./types";

function sample(overrides: Partial<WeatherSample> = {}): WeatherSample {
  return {
    coordinates: { latitude: 45.5, longitude: -72.75 },
    precipitationProbability: 0,
    precipitationMmPerHour: 0,
    cloudCover: 0,
    thunder: false,
    temperatureC: 20,
    windSpeedKmh: 10,
    ...overrides,
  };
}

describe("precipitationLevel (FR-043)", () => {
  it("reads a dry, open sky as clear", () => {
    expect(precipitationLevel(sample({ cloudCover: 20 }))).toBe("clear");
  });

  it("reads a covered but dry sky as cloudy", () => {
    expect(precipitationLevel(sample({ cloudCover: 80 }))).toBe("cloudy");
  });

  it("promotes a likely drizzle to showers", () => {
    expect(
      precipitationLevel(sample({ precipitationProbability: 40 })),
    ).toBe("showers");
    expect(
      precipitationLevel(sample({ precipitationMmPerHour: 0.3 })),
    ).toBe("showers");
  });

  it("calls a likely or heavy fall rain", () => {
    expect(
      precipitationLevel(sample({ precipitationProbability: 70 })),
    ).toBe("rain");
    expect(
      precipitationLevel(sample({ precipitationMmPerHour: 3 })),
    ).toBe("rain");
  });

  it("calls thunder or a downpour a storm", () => {
    expect(precipitationLevel(sample({ thunder: true }))).toBe("storm");
    expect(
      precipitationLevel(sample({ precipitationMmPerHour: 9 })),
    ).toBe("storm");
  });

  it("labels every level in French", () => {
    expect(precipitationLevelLabel("clear")).toBe("Ciel dégagé");
    expect(precipitationLevelLabel("storm")).toBe("Orage");
  });

  it("marks showers and worse as worth avoiding", () => {
    expect(isWetLevel("clear")).toBe(false);
    expect(isWetLevel("cloudy")).toBe(false);
    expect(isWetLevel("showers")).toBe(true);
    expect(isWetLevel("rain")).toBe(true);
    expect(isWetLevel("storm")).toBe(true);
  });
});

describe("precipitationRisk (FR-043)", () => {
  it("stays at zero under a dry sky", () => {
    expect(precipitationRisk(sample({ cloudCover: 90 }))).toBe(0);
  });

  it("weighs probability more than intensity", () => {
    const likelyDrizzle = precipitationRisk(
      sample({ precipitationProbability: 90, precipitationMmPerHour: 0.1 }),
    );
    const unlikelyDownpour = precipitationRisk(
      sample({ precipitationProbability: 20, precipitationMmPerHour: 8 }),
    );

    expect(likelyDrizzle).toBeGreaterThan(unlikelyDownpour);
  });

  it("pins a thunderstorm near the top whatever the millimetres say", () => {
    expect(
      precipitationRisk(
        sample({ precipitationProbability: 10, thunder: true }),
      ),
    ).toBeGreaterThanOrEqual(0.9);
  });

  it("never leaves the 0–1 range, even on malformed input", () => {
    const risk = precipitationRisk(
      sample({
        precipitationProbability: 400,
        precipitationMmPerHour: 200,
      }),
    );

    expect(risk).toBeLessThanOrEqual(1);
    expect(
      precipitationRisk(sample({ precipitationProbability: Number.NaN })),
    ).toBeGreaterThanOrEqual(0);
  });
});
