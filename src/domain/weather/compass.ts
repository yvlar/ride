/** FR-043 — the eight directions a rider can actually be told to take. */
export const COMPASS_SECTORS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SO",
  "O",
  "NO",
] as const;

export type CompassSector = (typeof COMPASS_SECTORS)[number];

const SECTOR_SPAN_DEG = 360 / COMPASS_SECTORS.length;

const SECTOR_LABELS: Record<CompassSector, string> = {
  N: "nord",
  NE: "nord-est",
  E: "est",
  SE: "sud-est",
  S: "sud",
  SO: "sud-ouest",
  O: "ouest",
  NO: "nord-ouest",
};

export function wrapBearingDeg(bearingDeg: number): number {
  if (!Number.isFinite(bearingDeg)) {
    return 0;
  }
  return ((bearingDeg % 360) + 360) % 360;
}

/** North spans −22.5°…+22.5°, so the boundaries fall between the names. */
export function compassSector(bearingDeg: number): CompassSector {
  const wrapped = wrapBearingDeg(bearingDeg);
  const index =
    Math.round(wrapped / SECTOR_SPAN_DEG) % COMPASS_SECTORS.length;
  return COMPASS_SECTORS[index];
}

export function compassSectorBearingDeg(sector: CompassSector): number {
  return COMPASS_SECTORS.indexOf(sector) * SECTOR_SPAN_DEG;
}

export function compassSectorLabel(sector: CompassSector): string {
  return SECTOR_LABELS[sector];
}
