import type { Coordinates } from "@/domain/geo/types";
import {
  precipitationLevel,
  precipitationLevelLabel,
  clampPercent,
} from "@/domain/weather/precipitation";
import type {
  PrecipitationLevel,
  RadarFrame,
  WeatherObservation,
} from "@/domain/weather/types";

/** FR-043 — one cloud drawn on the map, sized by the chance of rain. */
export type WeatherCloudMarker = {
  id: string;
  coordinates: Coordinates;
  level: PrecipitationLevel;
  /** Chance of precipitation, rounded to a whole percent. */
  probability: number;
  /** Accessible name, e.g. "Averses possibles, 60 % de risque de pluie". */
  label: string;
};

export type WeatherMapOverlay = {
  /** MapLibre raster template for the selected radar frame, when there is one. */
  radarTileUrlTemplate: string | null;
  radarOpacity: number;
  /** Deepest zoom the imagery exists at; the map upscales past it. */
  radarMaxZoom: number | null;
  clouds: WeatherCloudMarker[];
  attribution: string | null;
};

/** Radar under a route line has to stay readable without hiding the road. */
export const RADAR_LAYER_OPACITY = 0.6;
export const RADAR_UNAVAILABLE_MESSAGE = "Radar indisponible pour cette zone ou cette heure.";

/**
 * FR-043 — turn one observation into what the map draws. A `clear` sample gets
 * no marker: a cloudless sky is told by the absence of a cloud. With the field
 * sampled densely enough to cover the ground the radar draws, that is also the
 * only thing keeping a fair-weather map from being paved in icons.
 */
export function toWeatherMapOverlay(
  observation: WeatherObservation | null,
): WeatherMapOverlay | null {
  if (!observation) {
    return null;
  }

  const frame = selectRadarFrame(observation.radar.frames);

  return {
    radarTileUrlTemplate: frame?.tileUrlTemplate ?? null,
    radarOpacity: RADAR_LAYER_OPACITY,
    radarMaxZoom: observation.radar.maxZoom,
    attribution: observation.radar.attribution,
    clouds: observation.field.samples.flatMap((sample, index) => {
      const level = precipitationLevel(sample);
      if (level === "clear") {
        return [];
      }
      const probability = Math.round(
        clampPercent(sample.precipitationProbability),
      );
      return [
        {
          id: `cloud-${index}`,
          coordinates: sample.coordinates,
          level,
          probability,
          label: `${precipitationLevelLabel(level)}, ${probability} % de risque de pluie`,
        },
      ];
    }),
  };
}

/** The latest observed frame, or the first one when none is in the past. */
export function selectRadarFrame(frames: RadarFrame[]): RadarFrame | null {
  if (frames.length === 0) {
    return null;
  }
  const past = frames.filter((frame) => frame.kind === "past");
  return past[past.length - 1] ?? frames[0];
}
