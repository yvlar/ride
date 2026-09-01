import type {
  DataDrivenPropertyValueSpecification,
  FilterSpecification,
  FormattedSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { KART_ARCADE_PALETTE as C } from "./kart-arcade-palette";

/**
 * FR-046 — Kart Arcade needs vector data: an arcade palette cannot be reached
 * by recolouring raster tiles. The tiles are configured, never hard-coded with
 * a key, and the default endpoint is keyless (CURSOR.md §21, §25).
 */
export const DEFAULT_KART_ARCADE_TILES_URL =
  "https://tiles.openfreemap.org/planet";

export const DEFAULT_KART_ARCADE_GLYPHS_URL =
  "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/** Credit demanded by OpenStreetMap and by the default tile host. */
export const KART_ARCADE_DEFAULT_ATTRIBUTION =
  "© OpenStreetMap contributors, © OpenMapTiles, © OpenFreeMap";

/** A configured host is unknown to us; OSM is still owed its credit. */
export const KART_ARCADE_OSM_ATTRIBUTION = "© OpenStreetMap contributors";

const SOURCE = "openmaptiles";
const TERRAIN_SOURCE = "kart-arcade-terrain";

/**
 * Layers whose only job is atmosphere. Navigation hides them so the road, the
 * manoeuvre and the rider keep the screen to themselves (FR-046).
 */
export const KART_ARCADE_DECOR_LAYER_PREFIX = "kart-decor-";

const FONT_BOLD = ["Noto Sans Bold"];
const FONT_REGULAR = ["Noto Sans Regular"];

/**
 * OpenMapTiles keeps the local name in `name`; `name:fr` wins when both exist.
 * Real place names only — the theme never renames what is on the ground.
 */
const NAME_FIELD: DataDrivenPropertyValueSpecification<FormattedSpecification> =
  ["coalesce", ["get", "name:fr"], ["get", "name"]];

export type KartArcadeStyleOptions = {
  tilesUrl?: string;
  glyphsUrl?: string;
  /**
   * Optional Terrarium-encoded elevation tiles. Left unset there is simply no
   * hillshade: relief is a bonus, never a requirement (NFR-005).
   */
  terrainTilesUrl?: string;
  attribution?: string;
};

/**
 * Roads get wider as the map zooms in. One shared ramp keeps every class in
 * proportion instead of scattering magic numbers across a dozen layers.
 */
function roadWidth(
  scale: number,
): DataDrivenPropertyValueSpecification<number> {
  return [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    5,
    0.6 * scale,
    10,
    1.6 * scale,
    14,
    4 * scale,
    18,
    18 * scale,
  ];
}

/**
 * A road is a bright warm line on an overview and a real asphalt surface up
 * close, exactly as in the reference render. One crossfade, no second layer.
 */
function roadSurface(
  far: string,
  near: string,
): DataDrivenPropertyValueSpecification<string> {
  return ["interpolate", ["linear"], ["zoom"], 12.5, far, 14.5, near];
}

/**
 * The guardrail is the signature of this theme, so it is sized to be seen: at
 * riding zoom it leaves several pixels of white on each side of the roadway,
 * not the hairline a simple ratio would give.
 */
function casingWidth(
  scale: number,
): DataDrivenPropertyValueSpecification<number> {
  return [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    5,
    1.8 * scale,
    10,
    3.8 * scale,
    14,
    8 * scale,
    18,
    30 * scale,
  ];
}

const MOTORWAY = ["motorway", "trunk"];
const PRIMARY = ["primary"];
const SECONDARY = ["secondary", "tertiary"];
const MINOR = ["minor", "service", "street", "residential", "unclassified"];

function roadFilter(
  classes: string[],
  brunnel: "tunnel" | "bridge" | "surface",
): FilterSpecification {
  const brunnelFilter: FilterSpecification =
    brunnel === "surface"
      ? ["!", ["in", ["get", "brunnel"], ["literal", ["tunnel", "bridge"]]]]
      : ["==", ["get", "brunnel"], brunnel];
  return [
    "all",
    ["in", ["get", "class"], ["literal", classes]],
    brunnelFilter,
  ];
}

/**
 * FR-046 — the complete Kart Arcade basemap. Built from tokens so the palette
 * stays in one file, and returned as a plain style specification so MapLibre
 * loads it without a network round trip for the style document itself.
 */
export function kartArcadeStyleSpecification(
  options: KartArcadeStyleOptions = {},
): StyleSpecification {
  const tilesUrl = options.tilesUrl || DEFAULT_KART_ARCADE_TILES_URL;
  const glyphsUrl = options.glyphsUrl || DEFAULT_KART_ARCADE_GLYPHS_URL;
  const attribution =
    options.attribution ||
    (tilesUrl === DEFAULT_KART_ARCADE_TILES_URL
      ? KART_ARCADE_DEFAULT_ATTRIBUTION
      : KART_ARCADE_OSM_ATTRIBUTION);

  const sources: StyleSpecification["sources"] = {
    [SOURCE]: {
      type: "vector",
      url: tilesUrl,
      attribution,
    },
  };
  if (options.terrainTilesUrl) {
    sources[TERRAIN_SOURCE] = {
      type: "raster-dem",
      tiles: [options.terrainTilesUrl],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 13,
    };
  }

  const layers: LayerSpecification[] = [
    {
      id: "kart-background",
      type: "background",
      paint: { "background-color": C.land },
    },
    {
      id: "kart-landcover-grass",
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["grass", "farmland", "wetland"]],
      ],
      paint: { "fill-color": C.landLight, "fill-opacity": 0.9 },
    },
    {
      id: `${KART_ARCADE_DECOR_LAYER_PREFIX}landcover-sand`,
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["sand", "rock"]]],
      paint: { "fill-color": C.sand },
    },
    {
      id: `${KART_ARCADE_DECOR_LAYER_PREFIX}landcover-ice`,
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["ice", "glacier"]]],
      paint: { "fill-color": C.ice },
    },
    {
      id: "kart-landuse-urban",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["residential", "commercial", "industrial", "retail"]],
      ],
      paint: { "fill-color": C.urban, "fill-opacity": 0.85 },
    },
    {
      id: "kart-landcover-wood",
      type: "fill",
      source: SOURCE,
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["wood", "forest"]]],
      paint: {
        "fill-color": C.forest,
        // Distant forest reads as one mass; close up it lightens so a road
        // crossing it stays legible.
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6,
          0.95,
          14,
          0.72,
        ],
      },
    },
    {
      id: "kart-landcover-wood-edge",
      type: "line",
      source: SOURCE,
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["wood", "forest"]]],
      minzoom: 9,
      paint: {
        "line-color": C.forestDark,
        "line-width": 1.2,
        "line-opacity": 0.7,
      },
    },
    {
      id: "kart-park",
      type: "fill",
      source: SOURCE,
      "source-layer": "park",
      paint: { "fill-color": C.park, "fill-opacity": 0.55 },
    },
    {
      id: "kart-hillshade",
      type: "hillshade",
      source: TERRAIN_SOURCE,
      paint: {
        // Deliberately faint: relief is depth, not decoration, and it must
        // never darken a road (FR-046).
        "hillshade-exaggeration": 0.25,
        "hillshade-shadow-color": C.forestDark,
        "hillshade-highlight-color": "#FFFFFF",
      },
    },
    {
      id: "kart-water",
      type: "fill",
      source: SOURCE,
      "source-layer": "water",
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "class"], "ocean"],
          C.waterDeep,
          C.water,
        ],
      },
    },
    {
      // A pale band hugging the shore, blurred so it reads as shallow water
      // rather than a second outline. One line layer, no extra geometry.
      id: "kart-water-shore",
      type: "line",
      source: SOURCE,
      "source-layer": "water",
      minzoom: 6,
      paint: {
        "line-color": C.waterShallow,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2, 14, 14],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 6, 2, 14, 10],
        "line-offset": ["interpolate", ["linear"], ["zoom"], 6, -1, 14, -7],
      },
    },
    {
      id: "kart-water-edge",
      type: "line",
      source: SOURCE,
      "source-layer": "water",
      minzoom: 7,
      paint: {
        "line-color": C.waterEdge,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 14, 1.6],
        "line-opacity": 0.55,
      },
    },
    {
      id: "kart-waterway",
      type: "line",
      source: SOURCE,
      "source-layer": "waterway",
      minzoom: 8,
      paint: {
        "line-color": C.water,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 16, 4],
      },
    },
    {
      id: "kart-railway",
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "rail"],
      minzoom: 11,
      paint: {
        "line-color": C.railway,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 18, 3],
        "line-dasharray": [3, 2],
      },
    },
    // Tunnels first: a road that dives under the ground belongs below the ones
    // that stay on it.
    {
      id: "kart-road-tunnel",
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      filter: roadFilter([...MOTORWAY, ...PRIMARY, ...SECONDARY], "tunnel"),
      minzoom: 10,
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": C.tunnel,
        "line-width": roadWidth(0.9),
        "line-dasharray": [2, 1.5],
        "line-opacity": 0.85,
      },
    },
    {
      id: `${KART_ARCADE_DECOR_LAYER_PREFIX}path`,
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["path", "track"]]],
      minzoom: 13,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": C.path,
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.8, 18, 2.6],
        "line-dasharray": [2, 2],
      },
    },
  ];

  /*
   * Three passes, because a junction shows a seam the moment one road's
   * surface is painted over another road's rail: every guardrail first, then
   * every roadway, then every centre line.
   */
  const roadClasses: {
    id: string;
    classes: string[];
    scale: number;
    /** Warm hue on an overview. */
    far: string;
    /** Asphalt up close. */
    near: string;
    rail: string;
    /** Centre line, or null for a street too narrow to be marked. */
    line: string | null;
    minzoom: number;
  }[] = [
    {
      id: "minor",
      classes: MINOR,
      scale: 0.55,
      far: C.roadFar,
      near: C.asphaltMinor,
      rail: C.guardrail,
      line: null,
      // Dense residential grids are noise on a zoomed-out map (FR-046).
      minzoom: 12,
    },
    {
      id: "secondary",
      classes: SECONDARY,
      scale: 0.8,
      far: C.roadFar,
      near: C.asphalt,
      rail: C.guardrail,
      line: C.roadLine,
      minzoom: 9,
    },
    {
      id: "primary",
      classes: PRIMARY,
      scale: 1,
      far: C.roadFarMain,
      near: C.asphalt,
      rail: C.guardrail,
      line: C.roadLine,
      minzoom: 7,
    },
    {
      id: "motorway",
      classes: MOTORWAY,
      scale: 1.2,
      // A motorway keeps its coral at every zoom: it is the strongest signal
      // in the road hierarchy and it must not dissolve into the streets.
      far: C.motorway,
      near: C.motorway,
      rail: C.guardrail,
      line: C.motorwayEdge,
      minzoom: 5,
    },
  ];

  for (const road of roadClasses) {
    layers.push({
      id: `kart-road-${road.id}-casing`,
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      filter: roadFilter(road.classes, "surface"),
      minzoom: road.minzoom,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": road.rail,
        "line-width": casingWidth(road.scale),
      },
    } as LayerSpecification);
  }
  for (const road of roadClasses) {
    layers.push({
      id: `kart-road-${road.id}`,
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      filter: roadFilter(road.classes, "surface"),
      minzoom: road.minzoom,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": roadSurface(road.far, road.near),
        "line-width": roadWidth(road.scale),
      },
    } as LayerSpecification);
  }
  for (const road of roadClasses) {
    if (!road.line) {
      continue;
    }
    layers.push({
      id: `kart-road-${road.id}-line`,
      type: "line",
      source: SOURCE,
      "source-layer": "transportation",
      filter: roadFilter(road.classes, "surface"),
      // A stripe only means something once the roadway is asphalt and wide.
      minzoom: Math.max(road.minzoom, 13),
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": road.line,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13,
          0.6,
          18,
          1.9 * road.scale,
        ],
        "line-dasharray": [6, 5],
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13.5,
          0,
          15,
          0.95,
        ],
      },
    } as LayerSpecification);
  }

  layers.push({
    id: "kart-road-bridge-casing",
    type: "line",
    source: SOURCE,
    "source-layer": "transportation",
    filter: roadFilter(
      [...MOTORWAY, ...PRIMARY, ...SECONDARY, ...MINOR],
      "bridge",
    ),
    minzoom: 11,
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": C.guardrail,
      "line-width": casingWidth(1.1),
    },
  } as LayerSpecification);
  layers.push({
    id: "kart-road-bridge",
    type: "line",
    source: SOURCE,
    "source-layer": "transportation",
    filter: roadFilter(
      [...MOTORWAY, ...PRIMARY, ...SECONDARY, ...MINOR],
      "bridge",
    ),
    minzoom: 11,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      // One zoom-based interpolate, with the class test inside its stops:
      // MapLibre allows only a single zoom subexpression per property.
      "line-color": [
        "interpolate",
        ["linear"],
        ["zoom"],
        12.5,
        [
          "case",
          ["in", ["get", "class"], ["literal", MINOR]],
          C.roadFar,
          C.roadFarMain,
        ],
        14.5,
        [
          "case",
          ["in", ["get", "class"], ["literal", MINOR]],
          C.asphaltMinor,
          C.asphalt,
        ],
      ],
      "line-width": roadWidth(0.95),
    },
  } as LayerSpecification);

  layers.push(
    {
      id: "kart-building",
      type: "fill",
      source: SOURCE,
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-color": [
          "case",
          [">", ["coalesce", ["get", "render_height"], 0], 20],
          C.building,
          C.buildingSecondary,
        ],
        "fill-outline-color": C.buildingEdge,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.5, 16, 0.9],
      },
    },
    {
      id: "kart-road-label",
      type: "symbol",
      source: SOURCE,
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "text-field": NAME_FIELD,
        "text-font": FONT_REGULAR,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 18, 14],
      },
      paint: {
        "text-color": C.textPrimary,
        "text-halo-color": C.textHalo,
        "text-halo-width": 1.6,
      },
    },
    {
      id: `${KART_ARCADE_DECOR_LAYER_PREFIX}water-label`,
      type: "symbol",
      source: SOURCE,
      "source-layer": "water_name",
      minzoom: 9,
      layout: {
        "text-field": NAME_FIELD,
        "text-font": FONT_REGULAR,
        "text-size": 12,
        "text-max-width": 8,
      },
      paint: {
        "text-color": C.waterEdge,
        "text-halo-color": C.textHalo,
        "text-halo-width": 1.4,
      },
    },
    {
      id: `${KART_ARCADE_DECOR_LAYER_PREFIX}peak`,
      type: "symbol",
      source: SOURCE,
      "source-layer": "mountain_peak",
      minzoom: 11,
      layout: {
        "text-field": NAME_FIELD,
        "text-font": FONT_REGULAR,
        "text-size": 11,
        "text-offset": [0, 0.6],
        "text-anchor": "top",
      },
      paint: {
        "text-color": C.forestDark,
        "text-halo-color": C.textHalo,
        "text-halo-width": 1.4,
      },
    },
    {
      id: "kart-place-label",
      type: "symbol",
      source: SOURCE,
      "source-layer": "place",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["city", "town", "village", "suburb", "hamlet"]],
      ],
      layout: {
        "text-field": NAME_FIELD,
        // Size follows importance so a village never shouts over a city.
        "text-font": FONT_BOLD,
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          ["case", ["==", ["get", "class"], "city"], 13, 10],
          12,
          ["case", ["==", ["get", "class"], "city"], 20, 14],
        ],
        "text-max-width": 8,
      },
      paint: {
        "text-color": C.textPrimary,
        "text-halo-color": C.textHalo,
        "text-halo-width": 2,
      },
    },
  );

  const filtered = options.terrainTilesUrl
    ? layers
    : layers.filter((layer) => layer.id !== "kart-hillshade");

  return {
    version: 8,
    name: "ride-kart-arcade",
    glyphs: glyphsUrl,
    sources,
    layers: filtered,
  };
}
