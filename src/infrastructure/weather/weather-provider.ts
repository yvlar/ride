import type { Coordinates } from "@/domain/geo/types";
import type { RadarFrames, WeatherSample } from "@/domain/weather/types";

/**
 * FR-043 — one call for the whole sampled grid. Providers that only answer a
 * single point still implement this, so the application never fans out.
 */
export type WeatherProvider = {
  sample: (points: Coordinates[]) => Promise<WeatherSample[]>;
};

/** FR-043 — the radar imagery the map draws under the route. */
export type RadarProvider = {
  frames: () => Promise<RadarFrames>;
};
