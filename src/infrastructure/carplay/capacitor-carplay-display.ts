import type { PluginListenerHandle } from "@capacitor/core";
import type { CarPlayDisplay } from "./carplay-display";
import { RideCarPlay, type RideCarPlayPlugin } from "./ride-carplay-plugin";
import type { CarPlayDisplayEvent, CarPlaySessionSnapshot } from "./types";

export function createCapacitorCarPlayDisplay(
  plugin: RideCarPlayPlugin = RideCarPlay,
): CarPlayDisplay {
  return {
    start(snapshot: CarPlaySessionSnapshot) {
      return plugin.start(snapshot);
    },
    update(snapshot: CarPlaySessionSnapshot) {
      return plugin.update(snapshot);
    },
    stop() {
      return plugin.stop();
    },
    subscribe(listener: (event: CarPlayDisplayEvent) => void) {
      const handles: PluginListenerHandle[] = [];
      void plugin
        .addListener("connectionChange", (event) => {
          listener({ type: "connection", connected: event.connected });
        })
        .then((handle) => {
          handles.push(handle);
        });
      void plugin
        .addListener("muteChange", (event) => {
          listener({ type: "mute", muted: event.muted });
        })
        .then((handle) => {
          handles.push(handle);
        });
      return () => {
        for (const handle of handles) {
          void handle.remove();
        }
      };
    },
  };
}
