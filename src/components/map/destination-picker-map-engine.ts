import type { BoundingBox, Coordinates, Place } from "@/domain/geo/types";

export type DestinationPickerMapOptions = {
  center: Coordinates;
  userLocation?: Coordinates | null;
  initialDestination?: Place | null;
  initialBounds?: BoundingBox;
};

export type DestinationPickerMapHandlers = {
  onPick: (coordinates: Coordinates) => void;
  onError: (message: string) => void;
};

export type DestinationPickerMapHandle = {
  destroy: () => void;
};

export type DestinationPickerMapEngine = {
  mount: (
    container: HTMLElement,
    options: DestinationPickerMapOptions,
    handlers: DestinationPickerMapHandlers,
  ) => DestinationPickerMapHandle;
};
