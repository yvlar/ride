import type { StyleSpecification } from "maplibre-gl";
import type { Coordinates } from "@/domain/geo/types";
import type { MapDetailLevel, MapOverlayTheme } from "./map-theme-overlay";
import type { RecordedTrackOverlay } from "./recorded-track-overlay";
import type { RideMapViewModel } from "./ride-map-view-model";
import type { WeatherMapOverlay } from "./weather-overlay";

export const MAP_UNAVAILABLE_MESSAGE =
  "Le service de cartographie ne répond pas. Les informations du trajet restent disponibles.";

/** A MapLibre style: a URL, or an inline specification (FR-045). */
export type MapStyleSource = string | StyleSpecification;

export type MapMountOptions = {
  /** FR-045 — the basemap the rider picked in Réglages, resolved to a style. */
  mapStyle?: MapStyleSource;
  /** FR-046 — route, halo and building colours that belong to that theme. */
  mapOverlay?: MapOverlayTheme;
  /** FR-046 — how much atmosphere the map may show. Defaults to exploration. */
  detailLevel?: MapDetailLevel;
};

export type MapEngineHandle = {
  destroy: () => void;
  setUserLocation?: (
    coordinates: Coordinates | null,
    headingDeg?: number | null,
  ) => void;
  recenter?: () => void;
  overview?: () => void;
  setViewModel?: (viewModel: RideMapViewModel) => void;
  resize?: () => void;
  /** Preview GPS (FR-022). False during navigation so only LocationWatch stays (NFR-006). */
  setGeolocateEnabled?: (enabled: boolean) => void;
  /** Keep the camera on the rider after GeolocateControl is torn down (FR-024). */
  setFollowUser?: (enabled: boolean) => void;
  /** Live GPS recording trace, independent of any planned route (FR-041). */
  setRecordedTrack?: (overlay: RecordedTrackOverlay | null) => void;
  /**
   * FR-043 — radar imagery and cloud markers. Optional, so an engine without
   * raster support (the lightweight fallback) simply never shows the sky.
   */
  setWeather?: (overlay: WeatherMapOverlay | null) => void;
  /**
   * FR-038 — destination picking. While enabled the map reports a coordinate
   * for a desktop click, a mobile long press, and a drag of the pick marker.
   * Disabled by default, so the preview and navigation maps are untouched.
   */
  setPickEnabled?: (enabled: boolean) => void;
  /** Shows (or clears) the draggable destination marker (FR-038). */
  setPickMarker?: (coordinates: Coordinates | null) => void;
  /**
   * FR-045 — swap the basemap in place. The engine re-adds every source and
   * layer it owns once the new style settles; the map is never remounted.
   */
  setMapStyle?: (style: MapStyleSource, overlay?: MapOverlayTheme) => void;
  /**
   * FR-046 — exploration shows the full theme; navigation hides the decorative
   * layers so the road, the manoeuvre and the rider own the screen.
   */
  setDetailLevel?: (level: MapDetailLevel) => void;
};

export type MapEngineHandlers = {
  onError: (message: string) => void;
  onWarning?: (message: string) => void;
  /**
   * FR-042 — fires when the follow camera engages or is suspended, including
   * when the rider pans the map themselves. Lets the UI surface an obvious
   * recentre affordance instead of silently fighting the gesture.
   */
  onFollowUserChange?: (following: boolean) => void;
  /** FR-038 — a coordinate picked by click, long press, or marker drag. */
  onPick?: (coordinates: Coordinates) => void;
  /**
   * FR-046 — a basemap that could not be loaded was rolled back. The UI uses it
   * to return the rider to the standard theme instead of leaving them on a
   * setting that never applies.
   */
  onMapStyleFallback?: () => void;
};

export type MapEngine = {
  mount: (
    container: HTMLElement,
    viewModel: RideMapViewModel,
    handlers: MapEngineHandlers,
    options?: MapMountOptions,
  ) => MapEngineHandle;
};
