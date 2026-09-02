import type {
  ColorSpecification,
  DataDrivenPropertyValueSpecification,
  FillExtrusionLayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

export const RIDE_3D_BUILDINGS_LAYER_ID = "ride-3d-buildings";

/** FR-046 — the extrusion takes its colour from the active map theme. */
export type BuildingExtrusionAppearance = {
  color: string;
  opacity: number;
  /**
   * FR-046 — the zoom the volumes appear at. The default waits for street
   * zoom, where buildings are context for a maneuver. A theme that leans its
   * camera wants them earlier: at 45° a flat town is a stain, and the same
   * town in blocks is a place.
   */
  minzoom?: number;
  /**
   * Colour of the roofs, blended in as a wall rises. `null` keeps every face
   * the same flat colour.
   */
  highlightColor?: string | null;
  /** Shades each wall from its base upward, the way a moulded toy catches light. */
  verticalGradient?: boolean;
};

const DEFAULT_BUILDING_MINZOOM = 15;

export const DEFAULT_BUILDING_EXTRUSION_APPEARANCE: BuildingExtrusionAppearance =
  {
    color: "#94a3b8",
    opacity: 0.65,
  };

export function addRideBuildingExtrusions(
  map: {
    getLayer: (id: string) => unknown;
    getStyle: () => Pick<StyleSpecification, "sources" | "layers">;
    addLayer: (layer: FillExtrusionLayerSpecification) => unknown;
  },
  appearance: BuildingExtrusionAppearance = DEFAULT_BUILDING_EXTRUSION_APPEARANCE,
): void {
  if (map.getLayer(RIDE_3D_BUILDINGS_LAYER_ID)) {
    return;
  }
  const layer = buildingExtrusionLayer(map.getStyle(), appearance);
  if (layer) {
    map.addLayer(layer);
  }
}

/**
 * FR-046 — a tall block is lighter than a low one, so a skyline reads as a
 * skyline from above rather than as one orange mass. Without a highlight the
 * colour stays exactly the flat value it has always been.
 */
function buildingColor(
  appearance: BuildingExtrusionAppearance,
): DataDrivenPropertyValueSpecification<ColorSpecification> {
  if (!appearance.highlightColor) {
    return appearance.color;
  }
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "render_height"], ["get", "height"], 0],
    0,
    appearance.color,
    60,
    appearance.highlightColor,
  ];
}

/**
 * 3D buildings when the active style already has a vector `building` layer.
 * Raster fallback styles have no buildings (FR-024, NFR-005).
 */
export function buildingExtrusionLayer(
  style: Pick<StyleSpecification, "sources" | "layers">,
  appearance: BuildingExtrusionAppearance = DEFAULT_BUILDING_EXTRUSION_APPEARANCE,
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
    minzoom: appearance.minzoom ?? DEFAULT_BUILDING_MINZOOM,
    paint: {
      "fill-extrusion-color": buildingColor(appearance),
      "fill-extrusion-vertical-gradient": appearance.verticalGradient ?? true,
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
      "fill-extrusion-opacity": appearance.opacity,
    },
  };
}
