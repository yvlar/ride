import type { Place } from "@/domain/geo/types";
import type { SavedRide } from "@/domain/library/types";
import type { CarPlayCatalog } from "./types";

export const CARPLAY_RESUME_ID = "resume";

export function recentCatalogId(index: number): string {
  return `recent:${index}`;
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
    recents: source.recents.map((place, index) => ({
      id: recentCatalogId(index),
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
  | { type: "recent"; index: number }
  | { type: "saved"; id: string };

export function parseCarPlayCatalogId(
  id: string,
): ParsedCarPlayCatalogId | null {
  if (id === CARPLAY_RESUME_ID) {
    return { type: "resume" };
  }
  if (id.startsWith("recent:")) {
    const index = Number(id.slice("recent:".length));
    if (!Number.isInteger(index) || index < 0) {
      return null;
    }
    return { type: "recent", index };
  }
  if (id.startsWith("saved:")) {
    return { type: "saved", id: id.slice("saved:".length) };
  }
  return null;
}
