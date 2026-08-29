import { describe, expect, it } from "vitest";
import { initialBearingDeg } from "@/domain/geo/distance";
import { compassSector } from "@/domain/weather/compass";
import { weatherEscapeAdvice } from "@/domain/weather/escape-direction";
import { weatherSampleGrid } from "@/domain/weather/sample-grid";
import { mockRadarProvider, mockWeatherProvider } from "./mock-weather-provider";

const center = { latitude: 45.5, longitude: -72.75 };

describe("mockWeatherProvider (FR-043)", () => {
  it("answers one sample per requested point, in order", async () => {
    const points = weatherSampleGrid(center);

    const samples = await mockWeatherProvider.sample(points);

    expect(samples).toHaveLength(points.length);
    expect(samples.map((sample) => sample.coordinates)).toEqual(points);
  });

  it("puts its rain cell south-west, so every direction differs", async () => {
    const samples = await mockWeatherProvider.sample(
      weatherSampleGrid(center),
    );
    const wettest = samples.reduce((worst, sample) =>
      sample.precipitationProbability > worst.precipitationProbability
        ? sample
        : worst,
    );

    expect(compassSector(initialBearingDeg(center, wettest.coordinates))).toBe(
      "SO",
    );
  });

  it("drives the escape advice away from the cell", async () => {
    const samples = await mockWeatherProvider.sample(
      weatherSampleGrid(center),
    );

    const advice = weatherEscapeAdvice({
      center,
      radiusKm: 45,
      samples,
      observedAtIso: "2026-08-29T15:00:00.000Z",
    });

    expect(advice.avoid?.sector).toBe("SO");
    expect(advice.escape?.sector).toBe("NE");
  });

  it("is deterministic, so the offline map never flickers", async () => {
    const points = weatherSampleGrid(center);

    expect(await mockWeatherProvider.sample(points)).toEqual(
      await mockWeatherProvider.sample(points),
    );
  });

  it("answers an empty grid with no samples", async () => {
    expect(await mockWeatherProvider.sample([])).toEqual([]);
  });
});

describe("mockRadarProvider (FR-043)", () => {
  it("offers no imagery offline", async () => {
    expect(await mockRadarProvider.frames()).toEqual({
      frames: [],
      attribution: null,
      maxZoom: null,
    });
  });
});
