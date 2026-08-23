import { afterEach, describe, expect, it, vi } from "vitest";

const getWorkerUrl = vi.fn(() => "");
const setWorkerUrl = vi.fn();

vi.mock("maplibre-gl", () => ({
  getWorkerUrl: () => getWorkerUrl(),
  setWorkerUrl: (value: string) => setWorkerUrl(value),
}));

describe("ensureMapLibreWorkerUrl (FR-013)", () => {
  afterEach(() => {
    getWorkerUrl.mockReset();
    getWorkerUrl.mockReturnValue("");
    setWorkerUrl.mockReset();
  });

  it("sets a same-origin MapLibre worker URL before the map mounts", async () => {
    const { ensureMapLibreWorkerUrl, MAPLIBRE_WORKER_PATH } = await import(
      "./maplibre-worker-url"
    );

    const url = ensureMapLibreWorkerUrl();

    expect(MAPLIBRE_WORKER_PATH).toBe("/maplibre-gl-worker.mjs");
    expect(url).toMatch(/^https?:\/\/.+\/maplibre-gl-worker\.mjs$/);
    expect(url.startsWith(window.location.origin)).toBe(true);
    expect(setWorkerUrl).toHaveBeenCalledWith(url);
  });

  it("does not reset a worker URL that is already configured", async () => {
    const already = `${window.location.origin}/maplibre-gl-worker.mjs`;
    getWorkerUrl.mockReturnValue(already);

    const { ensureMapLibreWorkerUrl } = await import("./maplibre-worker-url");

    expect(ensureMapLibreWorkerUrl()).toBe(already);
    expect(setWorkerUrl).not.toHaveBeenCalled();
  });
});
