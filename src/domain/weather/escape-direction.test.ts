import { describe, expect, it } from "vitest";
import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { riskPercent, weatherEscapeAdvice } from "./escape-direction";
import { weatherSampleGrid } from "./sample-grid";
import type { WeatherField, WeatherSample } from "./types";

const center: Coordinates = { latitude: 45.5, longitude: -72.75 };

/** A field whose rain fades with distance from `cell`, like a real system. */
function fieldAround(
  cell: Coordinates | null,
  options: { radiusKm?: number; cellRadiusKm?: number; thunder?: boolean } = {},
): WeatherField {
  const radiusKm = options.radiusKm ?? 40;
  const cellRadiusKm = options.cellRadiusKm ?? 35;
  const samples: WeatherSample[] = weatherSampleGrid(center, radiusKm).map(
    (coordinates) => {
      const closeness = cell
        ? Math.max(0, 1 - haversineKm(cell, coordinates) / cellRadiusKm)
        : 0;
      return {
        coordinates,
        precipitationProbability: Math.round(closeness * 95),
        precipitationMmPerHour: closeness * 4,
        cloudCover: Math.round(20 + closeness * 70),
        thunder: options.thunder === true && closeness > 0.5,
        temperatureC: 20,
        windSpeedKmh: 12,
      };
    },
  );

  return {
    center,
    radiusKm,
    samples,
    observedAtIso: "2026-08-29T15:00:00.000Z",
  };
}

describe("weatherEscapeAdvice (FR-043)", () => {
  it("reports an open sky when nothing is falling anywhere", () => {
    const advice = weatherEscapeAdvice(fieldAround(null));

    expect(advice.localLevel).toBe("clear");
    expect(advice.avoid).toBeNull();
    expect(advice.escape).toBeNull();
    expect(advice.headline).toContain("Ciel dégagé");
    expect(advice.detail).toContain("Aucune pluie");
  });

  it("names the direction the bad weather sits in", () => {
    const cell = offsetCoordinates(center, 225, 45);

    const advice = weatherEscapeAdvice(fieldAround(cell));

    expect(advice.avoid?.sector).toBe("SO");
    expect(advice.headline).toContain("sud-ouest");
  });

  it("names the direction that is still open", () => {
    const cell = offsetCoordinates(center, 225, 45);

    const advice = weatherEscapeAdvice(fieldAround(cell));

    expect(advice.escape?.sector).toBe("NE");
    expect(advice.detail).toContain("Évitez le sud-ouest");
    expect(advice.detail).toContain("nord-est");
  });

  it("keeps the eight sectors in compass order, measured or not", () => {
    const advice = weatherEscapeAdvice(fieldAround(null));

    expect(advice.sectors.map((sector) => sector.sector)).toEqual([
      "N",
      "NE",
      "E",
      "SE",
      "S",
      "SO",
      "O",
      "NO",
    ]);
    for (const sector of advice.sectors) {
      expect(sector.sampleCount).toBeGreaterThan(0);
    }
  });

  it("offers no escape when the weather covers every direction", () => {
    const advice = weatherEscapeAdvice(
      fieldAround(center, { cellRadiusKm: 500 }),
    );

    expect(advice.avoid).not.toBeNull();
    expect(advice.escape).toBeNull();
    expect(advice.detail).toContain("Aucune direction nettement plus dégagée");
  });

  it("says so first when the rain is already overhead", () => {
    const advice = weatherEscapeAdvice(
      fieldAround(center, { cellRadiusKm: 60 }),
    );

    expect(advice.localRisk).toBeGreaterThan(0.35);
    expect(advice.headline).toContain("sur votre position");
  });

  it("reads the field from where the rider actually is, not its centre", () => {
    const cell = offsetCoordinates(center, 225, 45);
    const field = fieldAround(cell);
    // Standing north-east of the sampled centre puts the cell further south-west.
    const from = offsetCoordinates(center, 45, 20);

    const advice = weatherEscapeAdvice(field, from);

    expect(advice.avoid?.sector).toBe("SO");
    expect(advice.localRisk).toBeLessThan(
      weatherEscapeAdvice(field).localRisk + 1,
    );
  });

  it("carries a storm into the worst level of its sector", () => {
    const cell = offsetCoordinates(center, 90, 45);

    const advice = weatherEscapeAdvice(
      fieldAround(cell, { thunder: true }),
    );

    expect(advice.avoid?.sector).toBe("E");
    expect(advice.avoid?.level).toBe("storm");
  });

  it("survives an empty field instead of throwing", () => {
    const advice = weatherEscapeAdvice({
      center,
      radiusKm: 40,
      samples: [],
      observedAtIso: "2026-08-29T15:00:00.000Z",
    });

    expect(advice.localRisk).toBe(0);
    expect(advice.avoid).toBeNull();
    expect(advice.escape).toBeNull();
  });

  it("rounds a risk to a percentage for display", () => {
    expect(riskPercent(0.784)).toBe(78);
    expect(riskPercent(-1)).toBe(0);
    expect(riskPercent(4)).toBe(100);
  });
});
