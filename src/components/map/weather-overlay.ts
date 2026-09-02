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

export type WeatherOverlayOptions = {
  /** Radar frame to draw. Defaults to the most recent observed frame. */
  frameId?: string | null;
};

/**
 * FR-043 — turn one observation into what the map draws. A `clear` sample gets
 * no marker: a cloudless sky is told by the absence of a cloud. With the field
 * sampled densely enough to cover the ground the radar draws, that is also the
 * only thing keeping a fair-weather map from being paved in icons.
 */
export function toWeatherMapOverlay(
  observation: WeatherObservation | null,
  options: WeatherOverlayOptions = {},
): WeatherMapOverlay | null {
  if (!observation) {
    return null;
  }

  const frame = selectRadarFrame(observation.radar.frames, options.frameId);

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

/** The latest observation, unless the rider stepped to another frame. */
export function selectRadarFrame(
  frames: RadarFrame[],
  frameId?: string | null,
): RadarFrame | null {
  if (frames.length === 0) {
    return null;
  }
  if (frameId) {
    const chosen = frames.find((frame) => frame.id === frameId);
    if (chosen) {
      return chosen;
    }
  }
  const past = frames.filter((frame) => frame.kind === "past");
  return past[past.length - 1] ?? frames[0];
}

/**
 * FR-043 — a frame reads as a time, not an epoch: "Maintenant" for the latest
 * observation, "−10 min" behind it, "+20 min" for the nowcast that shows where
 * the cell is heading.
 */
export function radarFrameLabel(
  frame: RadarFrame,
  frames: RadarFrame[],
): string {
  const reference = latestPastTime(frames) ?? Date.parse(frame.timeIso);
  const minutes = Math.round((Date.parse(frame.timeIso) - reference) / 60_000);
  if (!Number.isFinite(minutes) || minutes === 0) {
    return "Maintenant";
  }
  return minutes > 0 ? `+${minutes} min` : `−${Math.abs(minutes)} min`;
}

function latestPastTime(frames: RadarFrame[]): number | null {
  let latest: number | null = null;
  for (const frame of frames) {
    if (frame.kind !== "past") {
      continue;
    }
    const time = Date.parse(frame.timeIso);
    if (Number.isFinite(time) && (latest === null || time > latest)) {
      latest = time;
    }
  }
  return latest;
}
