import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type {
  CarPlayCatalog,
  CarPlayConnection,
  CarPlaySessionSnapshot,
} from "./types";

export type RideCarPlayPluginStatus = {
  connected: boolean;
  stopRequested: boolean;
  muted: boolean;
};

export type RideCarPlayPlugin = {
  start(snapshot: CarPlaySessionSnapshot): Promise<CarPlayConnection>;
  update(snapshot: CarPlaySessionSnapshot): Promise<void>;
  stop(): Promise<void>;
  getConnection(): Promise<RideCarPlayPluginStatus>;
  addListener(
    eventName: "connectionChange",
    listener: (event: { connected: boolean }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "muteChange",
    listener: (event: { muted: boolean }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "stopRequested",
    listener: () => void,
  ): Promise<PluginListenerHandle>;
  setCatalog(catalog: CarPlayCatalog): Promise<void>;
  addListener(
    eventName: "catalogSelect",
    listener: (event: { id: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "searchQuery",
    listener: (event: { query: string }) => void,
  ): Promise<PluginListenerHandle>;
};

class RideCarPlayWeb {
  async start(): Promise<CarPlayConnection> {
    return { connected: false, ownsVoice: false };
  }

  async update(): Promise<void> {}

  async stop(): Promise<void> {}

  async getConnection(): Promise<RideCarPlayPluginStatus> {
    return { connected: false, stopRequested: false, muted: false };
  }

  async setCatalog(): Promise<void> {}
}

export const RideCarPlay = registerPlugin<RideCarPlayPlugin>("RideCarPlay", {
  web: () => new RideCarPlayWeb(),
});
