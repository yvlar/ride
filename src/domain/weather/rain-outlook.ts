/**
 * FR-043 — lecture d'une probabilité de pluie. Quatre paliers seulement : en
 * roulant, un pilote lit une forme et une couleur, pas un pourcentage au
 * dixième près. Le pourcentage reste affiché en clair à côté du nuage pour ne
 * jamais dépendre de la couleur seule (FR-037).
 */
export type RainLevel = "clear" | "possible" | "likely" | "certain";

/** Bornes basses, en pourcentage, de chaque palier. */
export const RAIN_LEVEL_THRESHOLDS = {
  possible: 20,
  likely: 50,
  certain: 80,
} as const;

const RAIN_LEVEL_LABELS: Record<RainLevel, string> = {
  clear: "Ciel dégagé",
  possible: "Averses possibles",
  likely: "Pluie probable",
  certain: "Pluie",
};

/** Nombre de gouttes dessinées sous le nuage, par palier. */
const RAIN_LEVEL_DROPS: Record<RainLevel, number> = {
  clear: 0,
  possible: 1,
  likely: 2,
  certain: 3,
};

export function rainLevel(precipitationProbability: number): RainLevel {
  const probability = clampProbability(precipitationProbability);
  if (probability >= RAIN_LEVEL_THRESHOLDS.certain) {
    return "certain";
  }
  if (probability >= RAIN_LEVEL_THRESHOLDS.likely) {
    return "likely";
  }
  if (probability >= RAIN_LEVEL_THRESHOLDS.possible) {
    return "possible";
  }
  return "clear";
}

export function rainLevelLabel(level: RainLevel): string {
  return RAIN_LEVEL_LABELS[level];
}

export function rainLevelDrops(level: RainLevel): number {
  return RAIN_LEVEL_DROPS[level];
}

/** Vrai dès qu'un pilote a une raison de contourner la zone. */
export function isWetLevel(level: RainLevel): boolean {
  return level === "likely" || level === "certain";
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

export function formatRainProbability(probability: number): string {
  return `${Math.round(clampProbability(probability))} %`;
}

/** Libellé complet d'un nuage : « Pluie probable, 65 % ». */
export function rainSampleLabel(precipitationProbability: number): string {
  const probability = clampProbability(precipitationProbability);
  return `${rainLevelLabel(rainLevel(probability))}, ${formatRainProbability(probability)}`;
}
