import { describe, expect, it } from "vitest";
import { KART_ARCADE_PALETTE } from "./kart-arcade-palette";
import {
  DEFAULT_KART_ARCADE_GLYPHS_URL,
  DEFAULT_KART_ARCADE_TILES_URL,
  KART_ARCADE_DECOR_LAYER_PREFIX,
  KART_ARCADE_DEFAULT_ATTRIBUTION,
  KART_ARCADE_OSM_ATTRIBUTION,
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
    const motorway = style.layers.find(
      (layer) => layer.id === "kart-road-motorway",
    );
    expect(motorway).toMatchObject({
      paint: { "line-color": KART_ARCADE_PALETTE.motorway },
    });
    const local = style.layers.find((layer) => layer.id === "kart-road-minor");
    expect(local).toMatchObject({
      paint: { "line-color": KART_ARCADE_PALETTE.roadLocal },
    });
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

  it("never gives a layer the same id twice", () => {
    const ids = layerIds(kartArcadeStyleSpecification());
    expect(new Set(ids).size).toBe(ids.length);
  });
});
