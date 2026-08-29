import { haversineKm, initialBearingDeg } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import {
  COMPASS_SECTORS,
  compassSector,
  compassSectorBearingDeg,
  compassSectorLabel,
  type CompassSector,
} from "./compass";
import {
  isWetLevel,
  precipitationLevel,
  precipitationRisk,
} from "./precipitation";
import { PRECIPITATION_LEVELS } from "./types";
import type { PrecipitationLevel, WeatherField, WeatherSample } from "./types";

/** A sample this close to the rider describes the sky overhead, not a sector. */
const LOCAL_SAMPLE_RADIUS_KM = 3;

/** Below this the sky is not worth a detour. */
export const ESCAPE_RISK_THRESHOLD = 0.35;

/** A way out has to be meaningfully drier, or the advice is noise. */
export const ESCAPE_RISK_MARGIN = 0.15;

/** Sectors this close in risk count as equally clear. */
const ESCAPE_TIE_EPSILON = 0.05;

export type SectorOutlook = {
  sector: CompassSector;
  bearingDeg: number;
  /**
   * Worst 0–1 risk found in this sector. Averaging would let a dry sample
   * 80 km out cancel a cell sitting 30 km out: what the rider needs to know is
   * whether there is anything wet that way at all.
   */
  risk: number;
  /** Worst level seen in the sector — one shower spoils a direction. */
  level: PrecipitationLevel;
  sampleCount: number;
};

export type WeatherEscapeAdvice = {
  /** Sky over the rider. */
  localRisk: number;
  localLevel: PrecipitationLevel;
  /** The eight sectors, always in compass order; empty ones keep risk 0. */
  sectors: SectorOutlook[];
  /** Wettest sector, only when it is actually wet. */
  avoid: SectorOutlook | null;
  /** Driest sector, only when it is a real improvement over `avoid`. */
  escape: SectorOutlook | null;
  headline: string;
  detail: string;
};

/**
 * FR-043 — read the sampled field from where the rider stands: which way the
 * bad weather sits, and which way is still open. This is the whole point of
 * putting the clouds on the map, so it is a pure function over the field and
 * never depends on how the samples were fetched.
 */
export function weatherEscapeAdvice(
  field: WeatherField,
  from: Coordinates = field.center,
): WeatherEscapeAdvice {
  const local = localSample(field.samples, from);
  const localRisk = local ? precipitationRisk(local) : 0;
  const localLevel = local ? precipitationLevel(local) : "clear";
  const sectors = sectorOutlooks(field.samples, from);

  const measured = sectors.filter((outlook) => outlook.sampleCount > 0);
  const wettest = maxBy(measured, (outlook) => outlook.risk);

  const avoid =
    wettest && wettest.risk >= ESCAPE_RISK_THRESHOLD ? wettest : null;
  const driest = clearestSector(measured, avoid);
  const threatened = avoid !== null || localRisk >= ESCAPE_RISK_THRESHOLD;
  const escape =
    threatened &&
    driest &&
    driest.risk + ESCAPE_RISK_MARGIN <= Math.max(localRisk, avoid?.risk ?? 0)
      ? driest
      : null;

  return {
    localRisk,
    localLevel,
    sectors,
    avoid,
    escape,
    headline: headlineFor({ field, localLevel, localRisk, avoid }),
    detail: detailFor({ localRisk, avoid, escape }),
  };
}

export function riskPercent(risk: number): number {
  return Math.round(Math.min(Math.max(risk, 0), 1) * 100);
}

function sectorOutlooks(
  samples: WeatherSample[],
  from: Coordinates,
): SectorOutlook[] {
  const buckets = new Map<CompassSector, WeatherSample[]>(
    COMPASS_SECTORS.map((sector) => [sector, []]),
  );

  for (const sample of samples) {
    const distanceKm = haversineKm(from, sample.coordinates);
    if (distanceKm < LOCAL_SAMPLE_RADIUS_KM) {
      continue;
    }
    const sector = compassSector(initialBearingDeg(from, sample.coordinates));
    buckets.get(sector)?.push(sample);
  }

  return COMPASS_SECTORS.map((sector) => {
    const bucket = buckets.get(sector) ?? [];
    return {
      sector,
      bearingDeg: compassSectorBearingDeg(sector),
      risk: worstRisk(bucket),
      level: worstLevel(bucket),
      sampleCount: bucket.length,
    };
  });
}

function localSample(
  samples: WeatherSample[],
  from: Coordinates,
): WeatherSample | null {
  let nearest: WeatherSample | null = null;
  let nearestKm = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const distanceKm = haversineKm(from, sample.coordinates);
    if (distanceKm < nearestKm) {
      nearest = sample;
      nearestKm = distanceKm;
    }
  }
  return nearest;
}

function worstRisk(samples: WeatherSample[]): number {
  let worst = 0;
  for (const sample of samples) {
    worst = Math.max(worst, precipitationRisk(sample));
  }
  return worst;
}

/**
 * The driest sector, and when several are equally dry the one furthest from
 * the weather: riding away from the cell beats riding alongside it.
 */
function clearestSector(
  measured: SectorOutlook[],
  avoid: SectorOutlook | null,
): SectorOutlook | null {
  const lowest = minBy(measured, (outlook) => outlook.risk);
  if (!lowest) {
    return null;
  }
  const tied = measured.filter(
    (outlook) => outlook.risk <= lowest.risk + ESCAPE_TIE_EPSILON,
  );
  if (!avoid || tied.length <= 1) {
    return tied[0] ?? lowest;
  }
  return (
    maxBy(tied, (outlook) =>
      angularDistanceDeg(outlook.bearingDeg, avoid.bearingDeg),
    ) ?? lowest
  );
}

function angularDistanceDeg(from: number, to: number): number {
  const delta = Math.abs(((from - to) % 360) + 360) % 360;
  return Math.min(delta, 360 - delta);
}

function worstLevel(samples: WeatherSample[]): PrecipitationLevel {
  let worst: PrecipitationLevel = "clear";
  for (const sample of samples) {
    const level = precipitationLevel(sample);
    if (PRECIPITATION_LEVELS.indexOf(level) > PRECIPITATION_LEVELS.indexOf(worst)) {
      worst = level;
    }
  }
  return worst;
}

function headlineFor({
  field,
  localLevel,
  localRisk,
  avoid,
}: {
  field: WeatherField;
  localLevel: PrecipitationLevel;
  localRisk: number;
  avoid: SectorOutlook | null;
}): string {
  if (isWetLevel(localLevel) || localRisk >= ESCAPE_RISK_THRESHOLD) {
    return `Mauvais temps sur votre position (${riskPercent(localRisk)} %).`;
  }
  if (avoid) {
    return `Mauvais temps vers le ${compassSectorLabel(avoid.sector)} (${riskPercent(avoid.risk)} %).`;
  }
  return `Ciel dégagé dans un rayon de ${Math.round(field.radiusKm)} km.`;
}

function detailFor({
  localRisk,
  avoid,
  escape,
}: {
  localRisk: number;
  avoid: SectorOutlook | null;
  escape: SectorOutlook | null;
}): string {
  if (escape) {
    const avoidPart = avoid
      ? `Évitez le ${compassSectorLabel(avoid.sector)}. `
      : "";
    return `${avoidPart}Le ciel reste ouvert vers le ${compassSectorLabel(escape.sector)} (${riskPercent(escape.risk)} %).`;
  }
  if (avoid) {
    return `Aucune direction nettement plus dégagée autour de vous : ${riskPercent(avoid.risk)} % au ${compassSectorLabel(avoid.sector)}.`;
  }
  if (localRisk >= ESCAPE_RISK_THRESHOLD) {
    return "Le mauvais temps couvre toutes les directions échantillonnées.";
  }
  return "Aucune pluie significative sur les directions échantillonnées.";
}

function maxBy<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const value = score(item);
    if (value > bestScore) {
      best = item;
      bestScore = value;
    }
  }
  return best;
}

function minBy<T>(items: T[], score: (item: T) => number): T | null {
  return maxBy(items, (item) => -score(item));
}
