import { describe, expect, it } from "vitest";
import type { RadarFrame, WeatherObservation } from "@/domain/weather/types";
import {
  RADAR_LAYER_OPACITY,
  radarFrameLabel,
  selectRadarFrame,
  toWeatherMapOverlay,
} from "./weather-overlay";

const frames: RadarFrame[] = [
  {
    id: "past-old",
    timeIso: "2026-08-29T14:40:00.000Z",
    kind: "past",
    tileUrlTemplate: "https://tiles.test/old/{z}/{x}/{y}.png",
  },
  {
    id: "past-latest",
    timeIso: "2026-08-29T15:00:00.000Z",
    kind: "past",
    tileUrlTemplate: "https://tiles.test/latest/{z}/{x}/{y}.png",
  },
  {
    id: "forecast-1",
    timeIso: "2026-08-29T15:20:00.000Z",
    kind: "forecast",
    tileUrlTemplate: "https://tiles.test/next/{z}/{x}/{y}.png",
  },
];

function observation(
  overrides: Partial<WeatherObservation> = {},
): WeatherObservation {
  return {
    field: {
      center: { latitude: 45.5, longitude: -72.75 },
      radiusKm: 45,
      observedAtIso: "2026-08-29T15:00:00.000Z",
      samples: [
        {
          coordinates: { latitude: 45.5, longitude: -72.75 },
          precipitationProbability: 5,
          precipitationMmPerHour: 0,
          cloudCover: 10,
          thunder: false,
          temperatureC: 21,
          windSpeedKmh: 10,
        },
        {
          coordinates: { latitude: 45.2, longitude: -73.1 },
          precipitationProbability: 72,
          precipitationMmPerHour: 3,
          cloudCover: 95,
          thunder: false,
          temperatureC: 18,
          windSpeedKmh: 20,
        },
      ],
    },
    radar: { frames, attribution: "Images radar © Test", maxZoom: 7 },
    ...overrides,
  };
}

describe("toWeatherMapOverlay (FR-043)", () => {
  it("draws nothing when the layer has no observation", () => {
    expect(toWeatherMapOverlay(null)).toBeNull();
  });

  it("leaves a clear sky uncluttered", () => {
    const overlay = toWeatherMapOverlay(observation());

    expect(overlay?.clouds).toHaveLength(1);
    expect(overlay?.clouds[0]!.coordinates).toEqual({
      latitude: 45.2,
      longitude: -73.1,
    });
  });

  it("labels a cloud with its level and its chance of rain", () => {
    const overlay = toWeatherMapOverlay(observation());

    expect(overlay?.clouds[0]).toMatchObject({
      level: "rain",
      probability: 72,
      label: "Pluie, 72 % de risque de pluie",
    });
  });

  it("shows the latest observation by default", () => {
    const overlay = toWeatherMapOverlay(observation());

    expect(overlay?.radarTileUrlTemplate).toBe(
      "https://tiles.test/latest/{z}/{x}/{y}.png",
    );
    expect(overlay?.radarOpacity).toBe(RADAR_LAYER_OPACITY);
    expect(overlay?.attribution).toBe("Images radar © Test");
  });

  it("follows the rider to a nowcast frame", () => {
    const overlay = toWeatherMapOverlay(observation(), {
      frameId: "forecast-1",
    });

    expect(overlay?.radarTileUrlTemplate).toBe(
      "https://tiles.test/next/{z}/{x}/{y}.png",
    );
  });

  it("keeps the clouds when there is no imagery at all", () => {
    const overlay = toWeatherMapOverlay(
      observation({ radar: { frames: [], attribution: null, maxZoom: null } }),
    );

    expect(overlay?.radarTileUrlTemplate).toBeNull();
    expect(overlay?.clouds).toHaveLength(1);
  });
});

describe("selectRadarFrame (FR-043)", () => {
  it("falls back to the latest observation for an unknown id", () => {
    expect(selectRadarFrame(frames, "gone")?.id).toBe("past-latest");
  });

  it("uses the first frame when the provider sends only a nowcast", () => {
    expect(selectRadarFrame([frames[2]!])?.id).toBe("forecast-1");
  });

  it("has nothing to select from an empty list", () => {
    expect(selectRadarFrame([])).toBeNull();
  });
});

describe("radarFrameLabel (FR-043)", () => {
  it("calls the latest observation the present", () => {
    expect(radarFrameLabel(frames[1]!, frames)).toBe("Maintenant");
  });

  it("counts a past frame backwards", () => {
    expect(radarFrameLabel(frames[0]!, frames)).toBe("−20 min");
  });

  it("counts a nowcast frame forwards, which is where the cell is going", () => {
    expect(radarFrameLabel(frames[2]!, frames)).toBe("+20 min");
  });
});
