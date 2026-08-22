import { getWorkerUrl, setWorkerUrl } from "maplibre-gl";

/**
 * Same-origin worker served from `public/` (FR-013).
 * MapLibre 6's defaultWorkerUrl() is empty in the Next.js/Turbopack
 * client bundle because import.meta.url is not http(s).
 */
export const MAPLIBRE_WORKER_PATH = "/maplibre-gl-worker.mjs";

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
