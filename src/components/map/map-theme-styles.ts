import type { StyleSpecification } from "maplibre-gl";
import type { ResolvedMapTheme } from "@/domain/map/map-theme";
import { FALLBACK_MAP_STYLE } from "./fallback-style";
import type { MapStyleConfig, MapStyleSource } from "./map-engine";
import {
  kartArcadeStyleFromPublicEnv,
  type MapVisualMode,
} from "./themes/kart-arcade-style";

/**
 * Dark vector basemap, no API key. Its own style.json carries the OpenStreetMap
 * and CARTO attribution the map control displays (CURSOR.md §21).
 */
export const DARK_MAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** FR-045 — raster imagery, so no `building` layer and no 3D (FR-024). */
export const SATELLITE_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "ride-satellite",
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    {
      id: "satellite",
      type: "raster",
      source: "satellite",
    },
  ],
};

/** FR-045 — relief and contour lines, useful in the Appalachians and Laurentides. */
export const TERRAIN_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "ride-terrain",
  sources: {
    opentopomap: {
      type: "raster",
      tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 17,
      attribution:
        "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)",
    },
  },
  layers: [
    {
      id: "opentopomap",
      type: "raster",
      source: "opentopomap",
    },
  ],
};

/**
 * FR-045 — the style MapLibre loads for a theme. `NEXT_PUBLIC_MAP_STYLE_URL`
 * defines the light basemap, so a deployment keeps its configured style and an
 * unset variable keeps the OSM raster fallback (FR-013, NFR-005).
 */
function standardStyleSource(theme: Exclude<ResolvedMapTheme, "kart-arcade">): MapStyleSource {
  if (theme === "dark") {
    return DARK_MAP_STYLE_URL;
  }
  if (theme === "satellite") {
    return SATELLITE_MAP_STYLE;
  }
  if (theme === "terrain") {
    return TERRAIN_MAP_STYLE;
  }
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_MAP_STYLE;
}

export function mapThemeStyle(
  theme: ResolvedMapTheme,
  mode: MapVisualMode = "exploration",
  standardFallback: "light" | "dark" = "light",
): MapStyleConfig {
  if (theme === "kart-arcade") {
    return {
      key: `kart-arcade:${mode}`,
      style: kartArcadeStyleFromPublicEnv(mode),
      fallbackStyle: standardStyleSource(standardFallback),
      visualTheme: "kart-arcade",
      visualMode: mode,
    };
  }
  return {
    key: `${theme}:${mode}`,
    style: standardStyleSource(theme),
    visualTheme: "standard",
    visualMode: mode,
  };
}
