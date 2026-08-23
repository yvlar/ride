import type { StyleSpecification } from "maplibre-gl";

/**
 * Raster fallback used when NEXT_PUBLIC_MAP_STYLE_URL is unset (NFR-005).
 * Attribution is required (CURSOR.md §21).
 */
export const FALLBACK_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "osm-raster-fallback",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};
