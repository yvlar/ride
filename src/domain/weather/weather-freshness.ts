/**
 * FR-043 — âge d'un relevé. Une météo affichée sans sa fraîcheur pousse un
 * pilote à faire confiance à une image périmée.
 */
export function weatherFreshnessLabel(
  observedAt: string,
  nowMs: number = Date.now(),
): string | null {
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) {
    return null;
  }
  const minutes = Math.floor((nowMs - observedMs) / 60_000);
  if (minutes < 0) {
    // Horloge du téléphone en avance : on ne prétend pas dater le relevé.
    return null;
  }
  if (minutes < 2) {
    return "à l’instant";
  }
  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "il y a 1 h" : `il y a ${hours} h`;
}

/** Au-delà de trente minutes, un relevé ne décrit plus le ciel actuel. */
export const WEATHER_STALE_AFTER_MS = 30 * 60_000;

export function isWeatherStale(
  observedAt: string,
  nowMs: number = Date.now(),
): boolean {
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) {
    return true;
  }
  return nowMs - observedMs > WEATHER_STALE_AFTER_MS;
}
