import type {
  CarPlayConnection,
  CarPlayDisplayEvent,
  CarPlaySessionSnapshot,
} from "./types";

/**
 * Infrastructure port for a vehicle display. Domain navigation must not import
 * CarPlay, MapKit or Capacitor (FR-028, NFR-007, BR-004).
 */
export type CarPlayDisplay = {
  start(snapshot: CarPlaySessionSnapshot): Promise<CarPlayConnection>;
  update(snapshot: CarPlaySessionSnapshot): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (event: CarPlayDisplayEvent) => void): () => void;
};
