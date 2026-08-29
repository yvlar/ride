import { haversineKm, initialBearingDeg } from "@/domain/geo/distance";
import {
  clampProbability,
  formatRainProbability,
  isWetLevel,
  rainLevel,
  rainLevelLabel,
  type RainLevel,
} from "./rain-outlook";
import type { WeatherOverlay, WeatherSample } from "./types";

export type CompassSectorId =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SO"
  | "O"
  | "NO";

export type CompassSector = {
  id: CompassSectorId;
  /** Libellé en minuscules : il s'insère dans une phrase. */
  label: string;
  /** Forme élidée pour « vers l'est » plutôt que « vers le est ». */
  towardLabel: string;
  bearingDeg: number;
};

export const COMPASS_SECTORS: readonly CompassSector[] = [
  { id: "N", label: "nord", towardLabel: "vers le nord", bearingDeg: 0 },
  { id: "NE", label: "nord-est", towardLabel: "vers le nord-est", bearingDeg: 45 },
  { id: "E", label: "est", towardLabel: "vers l’est", bearingDeg: 90 },
  { id: "SE", label: "sud-est", towardLabel: "vers le sud-est", bearingDeg: 135 },
  { id: "S", label: "sud", towardLabel: "vers le sud", bearingDeg: 180 },
  { id: "SO", label: "sud-ouest", towardLabel: "vers le sud-ouest", bearingDeg: 225 },
  { id: "O", label: "ouest", towardLabel: "vers l’ouest", bearingDeg: 270 },
  { id: "NO", label: "nord-ouest", towardLabel: "vers le nord-ouest", bearingDeg: 315 },
];

export type WeatherSectorOutlook = CompassSector & {
  /** Moyenne des probabilités relevées dans le secteur, 0–100. */
  probability: number;
  /** Pire relevé du secteur : une cellule orageuse ne doit pas être moyennée. */
  peakProbability: number;
  level: RainLevel;
  sampleCount: number;
};

export type WeatherDirectionAdvice = {
  sectors: WeatherSectorOutlook[];
  /** Secteur le plus sec, donc la direction à privilégier. */
  best: WeatherSectorOutlook | null;
  /** Secteur le plus arrosé, donc la direction à éviter. */
  worst: WeatherSectorOutlook | null;
  /** Secteurs où la pluie est probable ou certaine. */
  avoid: WeatherSectorOutlook[];
  /** Météo sur la position du pilote, quand un relevé local existe. */
  here: { probability: number; level: RainLevel } | null;
  /** Phrase prête à lire, sans dépendre de la couleur (FR-037). */
  message: string;
};

export const WEATHER_ADVICE_UNAVAILABLE =
  "Météo indisponible autour de votre position.";

/**
 * Distance minimale pour qu'un relevé décrive une *direction* plutôt que la
 * position courante. En deçà, il alimente `here`.
 */
const SECTOR_MIN_DISTANCE_KM = 10;

/**
 * FR-043 — répartit les relevés sur la rose des vents et en tire la direction
 * à privilégier. C'est ce qui transforme des nuages posés sur une carte en une
 * décision : de quel côté rouler pour éviter la pluie.
 */
export function weatherDirectionAdvice(
  overlay: WeatherOverlay | null,
  options: { minDistanceKm?: number } = {},
): WeatherDirectionAdvice {
  const empty: WeatherDirectionAdvice = {
    sectors: [],
    best: null,
    worst: null,
    avoid: [],
    here: null,
    message: WEATHER_ADVICE_UNAVAILABLE,
  };
  if (!overlay || overlay.samples.length === 0) {
    return empty;
  }

  const minDistanceKm = options.minDistanceKm ?? SECTOR_MIN_DISTANCE_KM;
  const origin = overlay.center;
  const buckets = new Map<CompassSectorId, WeatherSample[]>();
  const local: WeatherSample[] = [];

  for (const sample of overlay.samples) {
    const distanceKm = haversineKm(origin, sample.coordinates);
    if (distanceKm < minDistanceKm) {
      local.push(sample);
      continue;
    }
    const sector = sectorForBearing(
      initialBearingDeg(origin, sample.coordinates),
    );
    const bucket = buckets.get(sector.id);
    if (bucket) {
      bucket.push(sample);
      continue;
    }
    buckets.set(sector.id, [sample]);
  }

  const sectors: WeatherSectorOutlook[] = [];
  for (const sector of COMPASS_SECTORS) {
    const samples = buckets.get(sector.id);
    if (!samples || samples.length === 0) {
      continue;
    }
    const probabilities = samples.map((sample) =>
      clampProbability(sample.precipitationProbability),
    );
    const average =
      probabilities.reduce((total, value) => total + value, 0) /
      probabilities.length;
    sectors.push({
      ...sector,
      probability: average,
      peakProbability: Math.max(...probabilities),
      level: rainLevel(average),
      sampleCount: samples.length,
    });
  }

  if (sectors.length === 0) {
    return { ...empty, here: localOutlook(local) };
  }

  // Un secteur n'est « le meilleur » que s'il est sec de bout en bout : un pic
  // isolé sur une couronne suffit à disqualifier une direction.
  const best = [...sectors].sort(
    (left, right) =>
      left.peakProbability - right.peakProbability ||
      left.probability - right.probability,
  )[0]!;
  const worst = [...sectors].sort(
    (left, right) =>
      right.peakProbability - left.peakProbability ||
      right.probability - left.probability,
  )[0]!;
  const avoid = sectors.filter((sector) => isWetLevel(sector.level));
  const here = localOutlook(local);

  return {
    sectors,
    best,
    worst,
    avoid,
    here,
    message: adviceMessage(overlay, best, worst),
  };
}

export function sectorForBearing(bearingDeg: number): CompassSector {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % COMPASS_SECTORS.length;
  return COMPASS_SECTORS[index]!;
}

function localOutlook(
  samples: WeatherSample[],
): { probability: number; level: RainLevel } | null {
  if (samples.length === 0) {
    return null;
  }
  const probability =
    samples.reduce(
      (total, sample) => total + clampProbability(sample.precipitationProbability),
      0,
    ) / samples.length;
  return { probability, level: rainLevel(probability) };
}

function adviceMessage(
  overlay: WeatherOverlay,
  best: WeatherSectorOutlook,
  worst: WeatherSectorOutlook,
): string {
  if (!isWetLevel(worst.level) && worst.level !== "possible") {
    return `Aucune pluie attendue à ${Math.round(overlay.radiusKm)} km à la ronde.`;
  }
  const avoidPart = `${rainLevelLabel(worst.level)} ${worst.towardLabel} (${formatRainProbability(worst.probability)})`;
  if (best.id === worst.id) {
    return `${avoidPart}.`;
  }
  return `${avoidPart} · Meilleure direction : ${best.label} (${formatRainProbability(best.probability)})`;
}
