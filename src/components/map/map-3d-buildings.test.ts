import { describe, expect, it, vi } from "vitest";
import {
  RIDE_3D_BUILDINGS_LAYER_ID,
  addRideBuildingExtrusions,
  buildingExtrusionLayer,
} from "./map-3d-buildings";

describe("buildingExtrusionLayer (FR-024, NFR-005)", () => {
  it("does not invent buildings for the raster OSM fallback", () => {
    expect(
      buildingExtrusionLayer({
        sources: {
          osm: { type: "raster", tiles: ["https://example.test/{z}/{x}/{y}.png"] },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      }),
    ).toBeNull();
  });

  it("adds a fill-extrusion on a vector building source-layer", () => {
    const layer = buildingExtrusionLayer({
      sources: {
        openmaptiles: {
          type: "vector",
          tiles: ["https://example.test/{z}/{x}/{y}.pbf"],
        },
      },
      layers: [
        {
          id: "building",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "building",
        },
      ],
    });

    expect(layer).toEqual(
      expect.objectContaining({
        id: RIDE_3D_BUILDINGS_LAYER_ID,
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
      }),
    );
  });

  it("leaves styles that already extrude buildings unchanged", () => {
    expect(
      buildingExtrusionLayer({
        sources: {
          openmaptiles: {
            type: "vector",
            tiles: ["https://example.test/{z}/{x}/{y}.pbf"],
          },
        },
        layers: [
          {
            id: "building-3d",
            type: "fill-extrusion",
            source: "openmaptiles",
            "source-layer": "building",
          },
        ],
      }),
    ).toBeNull();
  });
});

describe("addRideBuildingExtrusions (FR-024, NFR-005)", () => {
  it("skips adding a second extrusion when the layer already exists", () => {
    const addLayer = vi.fn();
    addRideBuildingExtrusions({
      getLayer: () => ({}),
      getStyle: () => ({ sources: {}, layers: [] }),
      addLayer,
    });
    expect(addLayer).not.toHaveBeenCalled();
  });
});

describe("themed building extrusions (FR-046)", () => {
  const vectorStyle = {
    sources: { openmaptiles: { type: "vector" as const, url: "https://t.test" } },
    layers: [
      {
        id: "kart-building",
        type: "fill" as const,
        source: "openmaptiles",
        "source-layer": "building",
      },
    ],
  };

  it("takes its colour from the active theme", () => {
    const layer = buildingExtrusionLayer(vectorStyle, {
      color: "#F39A62",
      opacity: 0.55,
    });

    expect(layer?.paint).toMatchObject({
      "fill-extrusion-color": "#F39A62",
      "fill-extrusion-opacity": 0.55,
    });
  });

  it("keeps the original slate look when no theme is given", () => {
    expect(buildingExtrusionLayer(vectorStyle)?.paint).toMatchObject({
      "fill-extrusion-color": "#94a3b8",
      "fill-extrusion-opacity": 0.65,
    });
  });

  it("stays off a raster basemap, so no theme can slow the map down", () => {
    expect(
      buildingExtrusionLayer({
        sources: { osm: { type: "raster", tiles: ["https://t.test"] } },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      }),
    ).toBeNull();
  });
});

describe("toy volumes for the arcade camera (FR-046)", () => {
  const vectorStyle = {
    sources: { openmaptiles: { type: "vector" as const, url: "https://x.test" } },
    layers: [
      {
        id: "building",
        type: "fill" as const,
        source: "openmaptiles",
        "source-layer": "building",
      },
    ],
  };

  it("leaves the standard appearance exactly as it was", () => {
    const layer = buildingExtrusionLayer(vectorStyle);
    expect(layer?.minzoom).toBe(15);
    expect(layer?.paint?.["fill-extrusion-color"]).toBe("#94a3b8");
  });

  it("brings the volumes out early and shades them by height", () => {
    // A town seen at 45° from a regional zoom is a flat stain until the
    // buildings have somewhere to stand.
    const layer = buildingExtrusionLayer(vectorStyle, {
      color: "#F39A62",
      opacity: 0.55,
      minzoom: 13.5,
      highlightColor: "#FFD2A6",
      verticalGradient: true,
    });

    expect(layer?.minzoom).toBe(13.5);
    expect(layer?.paint?.["fill-extrusion-vertical-gradient"]).toBe(true);
    // Tall blocks catch the light, low ones stay in the base colour, so a
    // skyline reads as a skyline instead of as one orange mass.
    expect(layer?.paint?.["fill-extrusion-color"]).toEqual([
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "render_height"], ["get", "height"], 0],
      0,
      "#F39A62",
      60,
      "#FFD2A6",
    ]);
  });
});
