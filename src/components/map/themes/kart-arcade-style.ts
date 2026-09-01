import type { StyleSpecification } from "maplibre-gl";
import template from "./kart-arcade-style.json";
import { KART_ARCADE_STYLE_TOKENS } from "./kart-arcade-tokens";

export type MapVisualMode = "exploration" | "navigation";

const DEFAULT_TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const DEFAULT_GLYPHS_URL =
  "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const DEFAULT_ATTRIBUTION =
  "© OpenStreetMap contributors · © OpenFreeMap";

export function createKartArcadeStyle(
  mode: MapVisualMode,
  env: {
    tileJsonUrl?: string;
    glyphsUrl?: string;
    demTileJsonUrl?: string;
    attribution?: string;
    demAttribution?: string;
  } = {},
): StyleSpecification {
  const replacements: Record<string, string> = {
    ...KART_ARCADE_STYLE_TOKENS,
    __KA_TILEJSON_URL__: env.tileJsonUrl?.trim() || DEFAULT_TILEJSON_URL,
    __KA_GLYPHS_URL__: env.glyphsUrl?.trim() || DEFAULT_GLYPHS_URL,
    __KA_ATTRIBUTION__: env.attribution?.trim() || DEFAULT_ATTRIBUTION,
  };
  const serialized = JSON.stringify(template).replace(
    /__KA_[A-Z_]+__/g,
    (token) => replacements[token] ?? token,
  );
  const style = JSON.parse(serialized) as StyleSpecification;
  style.name = `ride-kart-arcade-${mode}`;

  if (mode === "navigation") {
    for (const layer of style.layers) {
      const metadata = layer.metadata as Record<string, unknown> | undefined;
      if (metadata?.["ride:decorative"] === true) {
        layer.layout = { ...layer.layout, visibility: "none" };
      }
    }
  }

  const demTileJsonUrl = env.demTileJsonUrl?.trim();
  if (demTileJsonUrl) {
    style.sources["kart-terrain-dem"] = {
      type: "raster-dem",
      url: demTileJsonUrl,
      tileSize: 256,
      attribution:
        env.demAttribution?.trim() || "Terrain: configured provider",
    };
    style.layers.splice(2, 0, {
      id: "kart-hillshade",
      type: "hillshade",
      source: "kart-terrain-dem",
      paint: {
        "hillshade-shadow-color": "#176B35",
        "hillshade-highlight-color": "#E9F8B8",
        "hillshade-accent-color": "#2F8F46",
        "hillshade-exaggeration": mode === "navigation" ? 0.15 : 0.28,
      },
    });
  }

  return style;
}

export function kartArcadeStyleFromPublicEnv(
  mode: MapVisualMode,
): StyleSpecification {
  return createKartArcadeStyle(mode, {
    tileJsonUrl: process.env.NEXT_PUBLIC_KART_ARCADE_TILEJSON_URL,
    glyphsUrl: process.env.NEXT_PUBLIC_KART_ARCADE_GLYPHS_URL,
    demTileJsonUrl: process.env.NEXT_PUBLIC_KART_ARCADE_DEM_TILEJSON_URL,
    attribution: process.env.NEXT_PUBLIC_KART_ARCADE_ATTRIBUTION,
    demAttribution: process.env.NEXT_PUBLIC_KART_ARCADE_DEM_ATTRIBUTION,
  });
}

export function isKartArcadeStyle(style: unknown): boolean {
  return Boolean(
    style &&
      typeof style === "object" &&
      "name" in style &&
      typeof style.name === "string" &&
      style.name.startsWith("ride-kart-arcade-"),
  );
}
