import type { RideStyle, RoutePreferences } from "@/domain/ride/types";

export const ROUTE_PREFERENCES_STORAGE_KEY = "ride.settings.routePreferences";
export const ROUTE_STYLE_STORAGE_KEY = "ride.settings.routeStyle";

export const DEFAULT_ROUTE_PREFERENCES: RoutePreferences = {
  avoidHighways: false,
  avoidUnpaved: true,
  stayInCanada: false,
};

export type StoredRouteStyle = Extract<RideStyle, "scenic" | "fastest">;
export const DEFAULT_ROUTE_STYLE: StoredRouteStyle = "scenic";

/**
 * FR-007, FR-008, FR-030 — session preferences from Réglages and applied
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

/** The Settings choice deliberately expires with the browser session. */
export function readStoredRouteStyle(
  storage: Pick<Storage, "getItem"> | null | undefined,
): StoredRouteStyle {
  const value = storage?.getItem(ROUTE_STYLE_STORAGE_KEY);
  return value === "fastest" || value === "scenic"
    ? value
    : DEFAULT_ROUTE_STYLE;
}

export function writeStoredRouteStyle(
  storage: Pick<Storage, "setItem"> | null | undefined,
  value: StoredRouteStyle,
): void {
  storage?.setItem(ROUTE_STYLE_STORAGE_KEY, value);
}
