import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type {
  CarPlayConnection,
  CarPlaySessionSnapshot,
} from "./types";

export type RideCarPlayPlugin = {
  start(snapshot: CarPlaySessionSnapshot): Promise<CarPlayConnection>;
  update(snapshot: CarPlaySessionSnapshot): Promise<void>;
  stop(): Promise<void>;
  getConnection(): Promise<{ connected: boolean }>;
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
};

class RideCarPlayWeb {
  async start(): Promise<CarPlayConnection> {
    return { connected: false, ownsVoice: false };
  }

  async update(): Promise<void> {}

  async stop(): Promise<void> {}

  async getConnection(): Promise<{ connected: boolean }> {
    return { connected: false };
  }
}

export const RideCarPlay = registerPlugin<RideCarPlayPlugin>("RideCarPlay", {
  web: () => new RideCarPlayWeb(),
});
