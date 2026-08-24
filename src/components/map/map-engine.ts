import type { Coordinates } from "@/domain/geo/types";
import type { RideMapViewModel } from "./ride-map-view-model";

export const MAP_UNAVAILABLE_MESSAGE =
  "Le service de cartographie ne répond pas. Les informations du trajet restent disponibles.";

export type MapEngineHandle = {
  destroy: () => void;
  setUserLocation?: (
    coordinates: Coordinates | null,
    headingDeg?: number | null,
  ) => void;
  recenter?: () => void;
  setViewModel?: (viewModel: RideMapViewModel) => void;
  resize?: () => void;
  /** Preview GPS (FR-022). False during navigation so only LocationWatch stays (NFR-006). */
  setGeolocateEnabled?: (enabled: boolean) => void;
  /** Keep the camera on the rider after GeolocateControl is torn down (FR-024). */
  setFollowUser?: (enabled: boolean) => void;
};

export type MapEngineHandlers = {
  onError: (message: string) => void;
  onWarning?: (message: string) => void;
};

export type MapEngine = {
  mount: (
    container: HTMLElement,
    viewModel: RideMapViewModel,
    handlers: MapEngineHandlers,
  ) => MapEngineHandle;
};
