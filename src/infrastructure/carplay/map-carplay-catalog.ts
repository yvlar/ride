import type { Place } from "@/domain/geo/types";
import type { SavedRide } from "@/domain/library/types";
import type { CarPlayCatalog } from "./types";

export const CARPLAY_RESUME_ID = "resume";

export function recentCatalogId(place: Place): string {
  const { latitude, longitude } = place.coordinates;
  return `recent:${latitude},${longitude}:${encodeURIComponent(place.label)}`;
}

export function savedCatalogId(id: string): string {
  return `saved:${id}`;
}

export type CarPlayCatalogSource = {
  recents: Place[];
  saved: SavedRide[];
  resumeTitle?: string | null;
  resumeSubtitle?: string | null;
};

/**
 * FR-028 — catalog of already-known places and saved rides for CPListTemplate.
 * Never invents coordinates.
 */
export function toCarPlayCatalog(source: CarPlayCatalogSource): CarPlayCatalog {
  return {
    recents: source.recents.map((place) => ({
      id: recentCatalogId(place),
      title: place.name?.trim() || place.label,
      subtitle: place.label !== place.name ? place.label : undefined,
    })),
    favorites: source.saved.map((item) => ({
      id: savedCatalogId(item.id),
      title: item.name,
      subtitle: `${Math.round(item.route.distanceKm)} km`,
    })),
    resumeTitle: source.resumeTitle ?? undefined,
    resumeSubtitle: source.resumeSubtitle ?? undefined,
  };
}

export type ParsedCarPlayCatalogId =
  | { type: "resume" }
  | { type: "recent"; key: string }
  | { type: "saved"; id: string };

const RECENT_KEY_PATTERN = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?:/;

export function parseCarPlayCatalogId(
  id: string,
): ParsedCarPlayCatalogId | null {
  if (id === CARPLAY_RESUME_ID) {
    return { type: "resume" };
  }
  if (id.startsWith("recent:")) {
    const key = id.slice("recent:".length);
    if (!RECENT_KEY_PATTERN.test(key)) {
      return null;
    }
    return { type: "recent", key };
  }
  if (id.startsWith("saved:")) {
    const savedId = id.slice("saved:".length);
    if (!savedId) {
      return null;
    }
    return { type: "saved", id: savedId };
  }
  return null;
}

export function findRecentPlaceByCatalogId(
  recents: Place[],
  catalogId: string,
): Place | null {
  return recents.find((place) => recentCatalogId(place) === catalogId) ?? null;
}
