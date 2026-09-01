import type {
  FillExtrusionLayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

export const RIDE_3D_BUILDINGS_LAYER_ID = "ride-3d-buildings";

export function addRideBuildingExtrusions(map: {
  getLayer: (id: string) => unknown;
  getStyle: () => Pick<StyleSpecification, "sources" | "layers">;
  addLayer: (layer: FillExtrusionLayerSpecification) => unknown;
}, options: { color?: string; enabled?: boolean } = {}): void {
  if (options.enabled === false) {
    return;
  }
  if (map.getLayer(RIDE_3D_BUILDINGS_LAYER_ID)) {
    return;
  }
  const layer = buildingExtrusionLayer(map.getStyle(), options.color);
  if (layer) {
    map.addLayer(layer);
  }
}

/**
 * 3D buildings when the active style already has a vector `building` layer.
 * Raster fallback styles have no buildings (FR-024, NFR-005).
 */
export function buildingExtrusionLayer(
  style: Pick<StyleSpecification, "sources" | "layers">,
  color = "#94a3b8",
): FillExtrusionLayerSpecification | null {
  const layers = style.layers ?? [];
  if (layers.some((layer) => layer.type === "fill-extrusion")) {
    return null;
  }

  const building = layers.find((layer) => {
    if (!("source-layer" in layer) || layer["source-layer"] !== "building") {
      return false;
    }
    if (!("source" in layer) || typeof layer.source !== "string") {
      return false;
    }
    return style.sources[layer.source]?.type === "vector";
  });
  if (!building || !("source" in building) || typeof building.source !== "string") {
    return null;
  }

  return {
    id: RIDE_3D_BUILDINGS_LAYER_ID,
    type: "fill-extrusion",
    source: building.source,
    "source-layer": "building",
    minzoom: 15,
    paint: {
      "fill-extrusion-color": color,
      "fill-extrusion-height": [
        "coalesce",
        ["get", "render_height"],
        ["get", "height"],
        0,
      ],
      "fill-extrusion-base": [
        "coalesce",
        ["get", "render_min_height"],
        ["get", "min_height"],
        0,
      ],
      "fill-extrusion-opacity": 0.65,
    },
  };
}
