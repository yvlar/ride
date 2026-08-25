import type { RoutePreferences } from "@/domain/ride/types";

export const ROUTE_PREFERENCES_STORAGE_KEY = "ride.settings.routePreferences";

export const DEFAULT_ROUTE_PREFERENCES: RoutePreferences = {
  avoidHighways: true,
  avoidUnpaved: true,
  stayInCanada: false,
};

/**
 * FR-007, FR-008, FR-030 — preferences stored from Réglages and applied
 * by Décrire mon trajet (FR-034), Trouver une destination (FR-038), and
 * GPX join / `<rte>` snap / off-route rejoin (FR-039).
 */
export function readStoredRoutePreferences(
  storage: Pick<Storage, "getItem"> | null | undefined,
): RoutePreferences {
  if (!storage) {
    return { ...DEFAULT_ROUTE_PREFERENCES };
  }
  const raw = storage.getItem(ROUTE_PREFERENCES_STORAGE_KEY);
  if (raw == null || raw.trim() === "") {
    return { ...DEFAULT_ROUTE_PREFERENCES };
  }
  try {
    return normalizeRoutePreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_ROUTE_PREFERENCES };
  }
}

export function writeStoredRoutePreferences(
  storage: Pick<Storage, "setItem"> | null | undefined,
  value: RoutePreferences,
): void {
  if (!storage) {
    return;
  }
  storage.setItem(
    ROUTE_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeRoutePreferences(value)),
  );
}

export function normalizeRoutePreferences(value: unknown): RoutePreferences {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_ROUTE_PREFERENCES };
  }
  const record = value as Record<string, unknown>;
  return {
    avoidHighways:
      typeof record.avoidHighways === "boolean"
        ? record.avoidHighways
        : DEFAULT_ROUTE_PREFERENCES.avoidHighways,
    avoidUnpaved:
      typeof record.avoidUnpaved === "boolean"
        ? record.avoidUnpaved
        : DEFAULT_ROUTE_PREFERENCES.avoidUnpaved,
    stayInCanada:
      typeof record.stayInCanada === "boolean"
        ? record.stayInCanada
        : DEFAULT_ROUTE_PREFERENCES.stayInCanada,
  };
}
