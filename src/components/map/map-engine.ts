import type { RideMapViewModel } from "./ride-map-view-model";

export const MAP_UNAVAILABLE_MESSAGE =
  "Le service de cartographie ne répond pas. Les informations du trajet restent disponibles.";

export type MapEngineHandle = {
  destroy: () => void;
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
