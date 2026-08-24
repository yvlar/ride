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
    setCatalog(catalog) {
      return plugin.setCatalog(catalog);
    },
    subscribe(listener: (event: CarPlayDisplayEvent) => void) {
      let removed = false;
      const handles: PluginListenerHandle[] = [];

      void (async () => {
        const stopHandle = await plugin.addListener("stopRequested", () => {
          listener({ type: "stop" });
        });
        if (removed) {
          await stopHandle.remove();
          return;
        }
        handles.push(stopHandle);

        const muteHandle = await plugin.addListener("muteChange", (event) => {
          listener({ type: "mute", muted: event.muted });
        });
        if (removed) {
          await muteHandle.remove();
          return;
        }
        handles.push(muteHandle);

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

        const catalogHandle = await plugin.addListener(
          "catalogSelect",
          (event) => {
            listener({ type: "catalogSelect", id: event.id });
          },
        );
        if (removed) {
          await catalogHandle.remove();
          return;
        }
        handles.push(catalogHandle);

        const searchHandle = await plugin.addListener(
          "searchQuery",
          (event) => {
            listener({ type: "searchQuery", query: event.query });
          },
        );
        if (removed) {
          await searchHandle.remove();
          return;
        }
        handles.push(searchHandle);

        const status = await plugin.getConnection();
        if (removed) {
          return;
        }
        listener({ type: "connection", connected: status.connected });
        listener({ type: "mute", muted: status.muted });
        if (status.stopRequested) {
          listener({ type: "stop" });
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
