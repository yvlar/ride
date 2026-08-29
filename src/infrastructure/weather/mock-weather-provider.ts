import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import type { RadarFrames, WeatherSample } from "@/domain/weather/types";
import type { RadarProvider, WeatherProvider } from "./weather-provider";

/** The synthetic cell sits south-west of the grid centre, 40 km out. */
const MOCK_CELL_BEARING_DEG = 225;
const MOCK_CELL_DISTANCE_KM = 40;
const MOCK_CELL_RADIUS_KM = 35;

/**
 * FR-043 — deterministic sky, so the map and the escape advice can be
 * exercised without a network. A single rain cell south-west of the rider
 * gives every direction something different to say.
 */
export const mockWeatherProvider: WeatherProvider = {
  async sample(points: Coordinates[]): Promise<WeatherSample[]> {
    const origin = points[0];
    if (!origin) {
      return [];
    }
    const cell = offsetCoordinates(
      origin,
      MOCK_CELL_BEARING_DEG,
      MOCK_CELL_DISTANCE_KM,
    );

    return points.map((point) => {
      const distanceKm = haversineKm(cell, point);
      const closeness = Math.max(0, 1 - distanceKm / MOCK_CELL_RADIUS_KM);
      return {
        coordinates: point,
        precipitationProbability: Math.round(closeness * 95),
        // Intensity climbs faster than probability, as a real cell does: the
        // fringe is a chance of rain, the core is the rain itself.
        precipitationMmPerHour: Number((closeness * closeness * 5).toFixed(2)),
        cloudCover: Math.round(20 + closeness * 75),
        thunder: false,
        temperatureC: Number((21 - closeness * 5).toFixed(1)),
        windSpeedKmh: 14,
      };
    });
  },
};

/** FR-043 — no imagery offline; the cloud markers still carry the field. */
export const mockRadarProvider: RadarProvider = {
  async frames(): Promise<RadarFrames> {
    return { frames: [], attribution: null };
  },
};
