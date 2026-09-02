import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import { KART_ARCADE_PALETTE } from "./kart-arcade-palette";
import {
  DEFAULT_KART_ARCADE_GLYPHS_URL,
  DEFAULT_KART_ARCADE_TILES_URL,
  KART_ARCADE_DECOR_LAYER_PREFIX,
  KART_ARCADE_DEFAULT_ATTRIBUTION,
  KART_ARCADE_OSM_ATTRIBUTION,
  KART_ARCADE_ROAD_WIDTH_SCALE,
  kartArcadeStyleSpecification,
} from "./kart-arcade-style";

function layerIds(style: ReturnType<typeof kartArcadeStyleSpecification>) {
  return style.layers.map((layer) => layer.id);
}

describe("kartArcadeStyleSpecification (FR-046)", () => {
  it("is a vector style, not a recolouring of raster tiles", () => {
    const style = kartArcadeStyleSpecification();
    expect(style.sources.openmaptiles).toMatchObject({
      type: "vector",
      url: DEFAULT_KART_ARCADE_TILES_URL,
    });
    expect(style.glyphs).toBe(DEFAULT_KART_ARCADE_GLYPHS_URL);
  });

  it("keeps the OpenStreetMap attribution on every configuration (CURSOR.md §21)", () => {
    const source = kartArcadeStyleSpecification().sources.openmaptiles;
    expect(source).toMatchObject({
      attribution: KART_ARCADE_DEFAULT_ATTRIBUTION,
    });
    expect(KART_ARCADE_DEFAULT_ATTRIBUTION).toContain("OpenStreetMap");

    const configured = kartArcadeStyleSpecification({
      tilesUrl: "https://tiles.example.test/planet",
    }).sources.openmaptiles;
    expect(configured).toMatchObject({
      attribution: KART_ARCADE_OSM_ATTRIBUTION,
    });
  });

  it("exposes no API key or query string of its own", () => {
    const serialized = JSON.stringify(kartArcadeStyleSpecification());
    expect(serialized).not.toMatch(/api[_-]?key/i);
    expect(serialized).not.toMatch(/access[_-]?token/i);
    expect(serialized).not.toContain("?");
  });

  it("takes its tile and glyph endpoints from configuration", () => {
    const style = kartArcadeStyleSpecification({
      tilesUrl: "https://tiles.example.test/planet",
      glyphsUrl: "https://tiles.example.test/fonts/{fontstack}/{range}.pbf",
    });
    expect(style.sources.openmaptiles).toMatchObject({
      url: "https://tiles.example.test/planet",
    });
    expect(style.glyphs).toBe(
      "https://tiles.example.test/fonts/{fontstack}/{range}.pbf",
    );
  });

  it("omits the hillshade until elevation tiles are configured", () => {
    expect(layerIds(kartArcadeStyleSpecification())).not.toContain(
      "kart-hillshade",
    );
    const relief = kartArcadeStyleSpecification({
      terrainTilesUrl: "https://dem.example.test/{z}/{x}/{y}.png",
    });
    expect(layerIds(relief)).toContain("kart-hillshade");
    expect(relief.sources["kart-arcade-terrain"]).toMatchObject({
      type: "raster-dem",
      encoding: "terrarium",
    });
  });

  it("paints the arcade palette from the shared tokens", () => {
    const style = kartArcadeStyleSpecification();
    const background = style.layers.find(
      (layer) => layer.id === "kart-background",
    );
    expect(background).toMatchObject({
      paint: { "background-color": KART_ARCADE_PALETTE.land },
    });
    // A motorway keeps its coral at every zoom.
    const motorway = style.layers.find(
      (layer) => layer.id === "kart-road-motorway",
    );
    expect(motorway).toMatchObject({
      paint: {
        "line-color": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12.5,
          KART_ARCADE_PALETTE.motorway,
          14.5,
          KART_ARCADE_PALETTE.motorway,
        ],
      },
    });
  });

  it("turns a warm overview road into asphalt as the map zooms in", () => {
    const style = kartArcadeStyleSpecification();
    for (const [id, far, near] of [
      ["kart-road-minor", KART_ARCADE_PALETTE.roadFar, KART_ARCADE_PALETTE.asphaltMinor],
      ["kart-road-secondary", KART_ARCADE_PALETTE.roadFar, KART_ARCADE_PALETTE.asphalt],
      ["kart-road-primary", KART_ARCADE_PALETTE.roadFarMain, KART_ARCADE_PALETTE.asphalt],
    ] as const) {
      const layer = style.layers.find((candidate) => candidate.id === id);
      expect(layer).toMatchObject({
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12.5,
            far,
            14.5,
            near,
          ],
        },
      });
    }
  });

  it("keeps the complete road network twice as wide after merging main", () => {
    const style = kartArcadeStyleSpecification();
    const primary = style.layers.find(
      (layer) => layer.id === "kart-road-primary",
    );
    const casing = style.layers.find(
      (layer) => layer.id === "kart-road-primary-casing",
    );

    expect(KART_ARCADE_ROAD_WIDTH_SCALE).toBe(2);
    expect(primary).toMatchObject({
      paint: {
        "line-width": [
          "interpolate",
          ["exponential", 1.5],
          ["zoom"],
          5,
          1.2,
          10,
          3.2,
          14,
          8,
          18,
          36,
        ],
      },
    });
    expect(casing).toMatchObject({
      paint: {
        "line-width": [
          "interpolate",
          ["exponential", 1.5],
          ["zoom"],
          5,
          3.6,
          10,
          7.6,
          14,
          16,
          18,
          60,
        ],
      },
    });
  });

  it("gives a main road a white guardrail and a yellow centre line", () => {
    const style = kartArcadeStyleSpecification();
    expect(
      style.layers.find((layer) => layer.id === "kart-road-primary-casing"),
    ).toMatchObject({ paint: { "line-color": KART_ARCADE_PALETTE.guardrail } });
    const line = style.layers.find(
      (layer) => layer.id === "kart-road-primary-line",
    );
    expect(line).toMatchObject({
      paint: { "line-color": KART_ARCADE_PALETTE.roadLine },
    });
    // Markings only once the roadway has become asphalt and is wide enough.
    expect(line?.minzoom ?? 0).toBeGreaterThanOrEqual(13);
    // A residential street is not marked at all.
    expect(
      style.layers.some((layer) => layer.id === "kart-road-minor-line"),
    ).toBe(false);
  });

  it("separates terrain, water, forest, buildings and every road class", () => {
    const ids = layerIds(kartArcadeStyleSpecification());
    for (const id of [
      "kart-background",
      "kart-landuse-urban",
      "kart-landcover-grass",
      "kart-landcover-wood",
      "kart-park",
      "kart-water",
      "kart-waterway",
      "kart-building",
      "kart-road-tunnel",
      "kart-road-bridge",
      "kart-road-motorway",
      "kart-road-primary",
      "kart-road-secondary",
      "kart-road-minor",
      `${KART_ARCADE_DECOR_LAYER_PREFIX}path`,
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("draws every surface-road casing under every surface road", () => {
    const ids = layerIds(kartArcadeStyleSpecification());
    const lastCasing = Math.max(
      ...ids
        .map((id, index) =>
          id.endsWith("-casing") && !id.includes("bridge") ? index : -1,
        )
        .filter((index) => index >= 0),
    );
    const firstSurface = Math.min(
      ...["minor", "secondary", "primary", "motorway"].map((klass) =>
        ids.indexOf(`kart-road-${klass}`),
      ),
    );
    expect(firstSurface).toBeGreaterThan(lastCasing);
    // A bridge is the exception: it rides above the roads it crosses.
    expect(ids.indexOf("kart-road-bridge")).toBeGreaterThan(
      ids.indexOf("kart-road-motorway"),
    );
  });

  it("hides minor roads on a zoomed-out map", () => {
    const style = kartArcadeStyleSpecification();
    const minor = style.layers.find((layer) => layer.id === "kart-road-minor");
    const motorway = style.layers.find(
      (layer) => layer.id === "kart-road-motorway",
    );
    expect(minor?.minzoom ?? 0).toBeGreaterThan(motorway?.minzoom ?? 0);
  });

  it("labels places in dark ink over a light halo, with real names", () => {
    const style = kartArcadeStyleSpecification();
    const place = style.layers.find((layer) => layer.id === "kart-place-label");
    expect(place).toMatchObject({
      paint: {
        "text-color": KART_ARCADE_PALETTE.textPrimary,
        "text-halo-color": KART_ARCADE_PALETTE.textHalo,
      },
    });
    // Accented French names come straight from the data, never rewritten.
    expect(
      (place as { layout?: { "text-field"?: unknown } }).layout?.["text-field"],
    ).toEqual(["coalesce", ["get", "name:fr"], ["get", "name"]]);
  });

  it("marks the decorative layers so navigation can hide them", () => {
    const decor = layerIds(kartArcadeStyleSpecification()).filter((id) =>
      id.startsWith(KART_ARCADE_DECOR_LAYER_PREFIX),
    );
    expect(decor.length).toBeGreaterThan(0);
    // A road is never decoration.
    expect(decor).not.toContain("kart-road-motorway");
  });

  it("passes MapLibre's own style validation", () => {
    // The renderer reports a bad expression as a load error at runtime, which
    // costs the rider the theme. Catch it here instead.
    for (const style of [
      kartArcadeStyleSpecification(),
      kartArcadeStyleSpecification({
        terrainTilesUrl: "https://dem.example.test/{z}/{x}/{y}.png",
      }),
    ]) {
      expect(validateStyleMin(style)).toEqual([]);
    }
  });

  it("never gives a layer the same id twice", () => {
    const ids = layerIds(kartArcadeStyleSpecification());
    expect(new Set(ids).size).toBe(ids.length);
  });
});
