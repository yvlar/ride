import type { ResolvedMapTheme } from "@/domain/map/map-theme";
import { KART_ARCADE_PALETTE } from "./themes/kart-arcade-palette";

/**
 * FR-046 — how much of the theme the map is allowed to show. Exploration is
 * the full arcade; navigation trades atmosphere for the road ahead.
 */
export type MapDetailLevel = "exploration" | "navigation";

/**
 * FR-046 — everything the engine draws *on top of* the basemap, expressed as
 * theme data. Route colours used to be literals inside the engine, which made a
 * second theme impossible without branching on its name in the renderer.
 */
export type MapOverlayTheme = {
  route: {
    color: string;
    width: number;
    /** White halo under the route. `null` leaves the standard single line. */
    casingColor: string | null;
    casingWidth: number;
    traveledColor: string;
    traveledWidth: number;
    connectorColor: string;
    /** Direction chevrons riding on the route. `null` leaves a plain line. */
    arrowColor: string | null;
    arrowOutline: string;
  };
  buildings: {
    color: string;
    opacity: number;
  };
  /** Marks the map container so the DOM markers can follow the theme. */
  containerClassName?: string;
  /**
   * FR-046 — return to the previous basemap when this one cannot load. Set for
   * themes that depend on a source Ride does not control, so an unreachable
   * tile host leaves the rider on a working map rather than a blank one
   * (NFR-005). The built-in themes keep the older behaviour: a failed load
   * simply leaves what is already on screen.
   */
  revertOnLoadFailure?: boolean;
};

/** The look Ride has always had, kept byte-for-byte for the built-in themes. */
export const STANDARD_MAP_OVERLAY_THEME: MapOverlayTheme = {
  route: {
    color: "#38bdf8",
    width: 4,
    casingColor: null,
    casingWidth: 0,
    traveledColor: "#64748b",
    traveledWidth: 6,
    connectorColor: "#f59e0b",
    arrowColor: null,
    arrowOutline: "#0f172a",
  },
  buildings: {
    color: "#94a3b8",
    opacity: 0.65,
  },
};

export const KART_ARCADE_MAP_OVERLAY_THEME: MapOverlayTheme = {
  route: {
    // Electric blue over a white halo: the one thing that must stay obvious in
    // full sun, over warm roads and over turquoise water alike.
    color: KART_ARCADE_PALETTE.route,
    // A ribbon, not a line: it has to outrank every road it crosses.
    width: 8,
    casingColor: KART_ARCADE_PALETTE.routeHalo,
    casingWidth: 16,
    traveledColor: KART_ARCADE_PALETTE.routeTraveled,
    traveledWidth: 8,
    connectorColor: KART_ARCADE_PALETTE.connector,
    arrowColor: KART_ARCADE_PALETTE.routeHalo,
    arrowOutline: KART_ARCADE_PALETTE.route,
  },
  buildings: {
    color: KART_ARCADE_PALETTE.building,
    opacity: 0.55,
  },
  containerClassName: "ride-map-kart-arcade",
  revertOnLoadFailure: true,
};

export function mapThemeOverlay(theme: ResolvedMapTheme): MapOverlayTheme {
  return theme === "kart-arcade"
    ? KART_ARCADE_MAP_OVERLAY_THEME
    : STANDARD_MAP_OVERLAY_THEME;
}
