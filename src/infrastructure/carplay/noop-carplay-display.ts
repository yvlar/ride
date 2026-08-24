import type { CarPlayDisplay } from "./carplay-display";

/** Web / tests: CarPlay is absent (FR-028). */
export function createNoopCarPlayDisplay(): CarPlayDisplay {
  return {
    async start() {
      return { connected: false, ownsVoice: false };
    },
    async update() {},
    async stop() {},
    async setCatalog() {},
    subscribe() {
      return () => {};
    },
  };
}
