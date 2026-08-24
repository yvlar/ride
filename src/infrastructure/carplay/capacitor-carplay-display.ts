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
      let removed = false;
      const handles: PluginListenerHandle[] = [];

      void (async () => {
        const connectionHandle = await plugin.addListener(
          "connectionChange",
          (event) => {
            listener({ type: "connection", connected: event.connected });
          },
        );
        if (removed) {
          await connectionHandle.remove();
          return;
        }
        handles.push(connectionHandle);

        const muteHandle = await plugin.addListener("muteChange", (event) => {
          listener({ type: "mute", muted: event.muted });
        });
        if (removed) {
          await muteHandle.remove();
          return;
        }
        handles.push(muteHandle);

        const stopHandle = await plugin.addListener("stopRequested", () => {
          listener({ type: "stop" });
        });
        if (removed) {
          await stopHandle.remove();
          return;
        }
        handles.push(stopHandle);

        const connection = await plugin.getConnection();
        if (!removed) {
          listener({ type: "connection", connected: connection.connected });
        }
      })();

      return () => {
        removed = true;
        for (const handle of handles) {
          void handle.remove();
        }
      };
    },
  };
}
