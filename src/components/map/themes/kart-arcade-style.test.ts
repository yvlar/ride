import { describe, expect, it } from "vitest";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { createKartArcadeStyle } from "./kart-arcade-style";
import {
  KART_ARCADE_COLORS,
  KART_ARCADE_ROAD_WIDTH_SCALE,
} from "./kart-arcade-tokens";

describe("Kart Arcade MapLibre style", () => {
  it("is valid against the MapLibre v8 style specification", () => {
    expect(validateStyleMin(createKartArcadeStyle("exploration"))).toEqual([]);
    expect(validateStyleMin(createKartArcadeStyle("navigation"))).toEqual([]);
  });

  it("builds an attributed vector style from configurable public endpoints", () => {
    const style = createKartArcadeStyle("exploration", {
      tileJsonUrl: "https://tiles.example.test/planet.json",
      glyphsUrl: "https://fonts.example.test/{fontstack}/{range}.pbf",
      attribution: "© OpenStreetMap contributors · © Example Tiles",
    });

    expect(style).toMatchObject({
      version: 8,
      name: "ride-kart-arcade-exploration",
      glyphs: "https://fonts.example.test/{fontstack}/{range}.pbf",
    });
    expect(style.sources.openmaptiles).toMatchObject({
      type: "vector",
      url: "https://tiles.example.test/planet.json",
      attribution: "© OpenStreetMap contributors · © Example Tiles",
    });
    expect(JSON.stringify(style)).not.toContain("tile.openstreetmap.org");
    expect(JSON.stringify(style)).not.toMatch(/(?:api[_-]?key|token)=/i);
  });

  it("uses the centralized arcade palette for terrain, water, roads and text", () => {
    const serialized = JSON.stringify(createKartArcadeStyle("exploration"));

    for (const color of [
      KART_ARCADE_COLORS.terrain,
      KART_ARCADE_COLORS.forest,
      KART_ARCADE_COLORS.water,
      KART_ARCADE_COLORS.localRoad,
      KART_ARCADE_COLORS.mainRoad,
      KART_ARCADE_COLORS.highway,
      KART_ARCADE_COLORS.primaryText,
    ]) {
      expect(serialized).toContain(color);
    }
  });

  it("renders every road category at twice its original width", () => {
    const style = createKartArcadeStyle("exploration");
    const roadLayers = style.layers.filter(
      (layer) =>
        layer.type === "line" &&
        /kart-(?:tunnel|road|path|bridge)/.test(layer.id),
    );

    expect(roadLayers).toHaveLength(8);
    for (const layer of roadLayers) {
      if (layer.type !== "line") {
        throw new Error(`Expected a line layer: ${layer.id}`);
      }
      const width = layer.paint?.["line-width"];
      expect(width).toBeInstanceOf(Array);
      if (!Array.isArray(width)) {
        throw new Error(`Expected an expression width: ${layer.id}`);
      }
      expect(width[0]).toBe("interpolate");
      for (let index = 4; index < width.length; index += 2) {
        expect(width[index]).toMatchObject([
          "*",
          expect.anything(),
          KART_ARCADE_ROAD_WIDTH_SCALE,
        ]);
      }
    }
  });

  it("reduces decorative paths and POIs during active navigation", () => {
    const style = createKartArcadeStyle("navigation");
    const decorative = style.layers.filter(
      (layer) =>
        (layer.metadata as Record<string, unknown> | undefined)?.[
          "ride:decorative"
        ] === true,
    );

    expect(decorative.length).toBeGreaterThan(0);
    expect(decorative.every((layer) => layer.layout?.visibility === "none")).toBe(
      true,
    );
    expect(style.layers.some((layer) => layer.id === "kart-road-label")).toBe(
      true,
    );
  });

  it("adds subtle hillshade only when a DEM source is configured", () => {
    expect(
      createKartArcadeStyle("exploration").layers.some(
        (layer) => layer.id === "kart-hillshade",
      ),
    ).toBe(false);

    const style = createKartArcadeStyle("navigation", {
      demTileJsonUrl: "https://terrain.example.test/dem.json",
      demAttribution: "© Example Terrain",
    });
    expect(style.sources["kart-terrain-dem"]).toMatchObject({
      type: "raster-dem",
      url: "https://terrain.example.test/dem.json",
      attribution: "© Example Terrain",
    });
    expect(style.layers.find((layer) => layer.id === "kart-hillshade")).toMatchObject(
      { paint: { "hillshade-exaggeration": 0.15 } },
    );
  });
});
