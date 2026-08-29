import { describe, expect, it, vi } from "vitest";
import {
  RAINVIEWER_ATTRIBUTION,
  RAINVIEWER_BASE_URL,
  RAINVIEWER_MAX_TILE_ZOOM,
  RainViewerRadarProvider,
} from "./rainviewer-radar-provider";

const maps = {
  host: "https://tilecache.rainviewer.test",
  radar: {
    past: [
      { time: 1_772_000_000, path: "/v2/radar/1772000000" },
      { time: 1_772_000_600, path: "/v2/radar/1772000600" },
      { time: 1_772_001_200, path: "/v2/radar/1772001200" },
      { time: 1_772_001_800, path: "/v2/radar/1772001800" },
    ],
    nowcast: [
      { time: 1_772_002_400, path: "/v2/radar/nowcast_1" },
      { time: 1_772_003_000, path: "/v2/radar/nowcast_2" },
    ],
  },
};

function jsonFetch(payload: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function provider(payload: unknown, status = 200, apiKey?: string) {
  return new RainViewerRadarProvider(
    RAINVIEWER_BASE_URL,
    jsonFetch(payload, status) as unknown as typeof fetch,
    apiKey,
  );
}

describe("RainViewerRadarProvider (FR-043)", () => {
  it("keeps the recent observations and the nowcast", async () => {
    const frames = await provider(maps).frames();

    expect(frames.frames.map((frame) => frame.kind)).toEqual([
      "past",
      "past",
      "past",
      "forecast",
      "forecast",
    ]);
    expect(frames.attribution).toBe(RAINVIEWER_ATTRIBUTION);
  });

  it("builds a MapLibre raster template from the host and path", async () => {
    const frames = await provider(maps).frames();

    expect(frames.frames[0]!.tileUrlTemplate).toBe(
      "https://tilecache.rainviewer.test/v2/radar/1772000600/256/{z}/{x}/{y}/2/1_1.png",
    );
  });

  it("dates each frame so the UI can label it", async () => {
    const frames = await provider(maps).frames();

    expect(frames.frames[0]!.timeIso).toBe(
      new Date(1_772_000_600 * 1000).toISOString(),
    );
    expect(frames.frames[0]!.id).toBe("past-1772000600");
  });

  it("declares the deepest zoom it actually serves", async () => {
    const frames = await provider(maps).frames();

    // Deeper than this RainViewer answers 200 with a placeholder image.
    expect(frames.maxZoom).toBe(RAINVIEWER_MAX_TILE_ZOOM);
    expect(RAINVIEWER_MAX_TILE_ZOOM).toBe(7);
  });

  it("still answers when the provider has no nowcast", async () => {
    const frames = await provider({
      host: maps.host,
      radar: { past: maps.radar.past },
    }).frames();

    expect(frames.frames.every((frame) => frame.kind === "past")).toBe(true);
  });

  it("answers with no imagery rather than failing on an empty radar", async () => {
    const frames = await provider({ host: maps.host, radar: {} }).frames();

    expect(frames.frames).toEqual([]);
    expect(frames.maxZoom).toBe(RAINVIEWER_MAX_TILE_ZOOM);
  });

  it("reports an HTTP failure in French", async () => {
    await expect(provider({}, 502).frames()).rejects.toThrow("Radar HTTP 502");
  });

  it("rejects a payload that is not a radar index", async () => {
    await expect(provider({ radar: "nope" }).frames()).rejects.toThrow(
      "Réponse radar invalide.",
    );
  });

  it("refuses a base URL that is not HTTP", () => {
    expect(() => new RainViewerRadarProvider("ftp://example.test")).toThrow(
      "RADAR_API_BASE_URL",
    );
  });
});
