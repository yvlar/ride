import { getWorkerUrl, setWorkerUrl } from "maplibre-gl";

/**
 * Same-origin worker served from `public/` (FR-013).
 * MapLibre 5 keeps a WebGL1 fallback for browsers and embedded webviews that
 * cannot create a WebGL2 context. Its CSP worker is copied at build time so
 * the client never depends on a blob worker or a third-party origin.
 */
export const MAPLIBRE_WORKER_PATH = "/maplibre-gl-worker.js";

export function ensureMapLibreWorkerUrl(): string {
  const url =
    typeof window === "undefined"
      ? MAPLIBRE_WORKER_PATH
      : new URL(MAPLIBRE_WORKER_PATH, window.location.origin).href;
  if (getWorkerUrl() !== url) {
    setWorkerUrl(url);
  }
  return url;
}
