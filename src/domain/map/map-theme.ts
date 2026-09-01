import type { ResolvedAppearance } from "@/domain/appearance/appearance";

/** FR-045 — the basemap themes offered in Réglages. */
export type MapTheme =
  | "auto"
  | "light"
  | "dark"
  | "satellite"
  | "terrain"
  | "kart-arcade";

/** A theme the map engine can actually load: `auto` is resolved away first. */
export type ResolvedMapTheme = Exclude<MapTheme, "auto">;

export const MAP_THEME_STORAGE_KEY = "ride.settings.mapTheme.v1";

export const DEFAULT_MAP_THEME: MapTheme = "auto";

const MAP_THEMES: readonly MapTheme[] = [
  "auto",
  "light",
  "dark",
  "satellite",
  "terrain",
  "kart-arcade",
];

export function isMapTheme(value: unknown): value is MapTheme {
  return (
    typeof value === "string" && MAP_THEMES.includes(value as MapTheme)
  );
}

/**
 * FR-045 — unlike the route style, the basemap choice outlives the browser
 * session, so it is read from and written to `localStorage`.
 */
export function readStoredMapTheme(
  storage: Pick<Storage, "getItem"> | null | undefined,
): MapTheme {
  const value = storage?.getItem(MAP_THEME_STORAGE_KEY);
  return isMapTheme(value) ? value : DEFAULT_MAP_THEME;
}

export function writeStoredMapTheme(
  storage: Pick<Storage, "setItem"> | null | undefined,
  value: MapTheme,
): void {
  storage?.setItem(MAP_THEME_STORAGE_KEY, value);
}

/**
 * FR-045, FR-037 — `auto` follows the interface appearance: night riding keeps
 * the dark basemap, so the screen never flashes white in the dark.
 */
export function resolveMapTheme(
  theme: MapTheme,
  appearance: ResolvedAppearance,
): ResolvedMapTheme {
  if (theme !== "auto") {
    return theme;
  }
  return appearance === "light" ? "light" : "dark";
}
