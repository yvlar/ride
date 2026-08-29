import type { RadarFrame, RadarFrames } from "@/domain/weather/types";
import type { RadarProvider } from "./weather-provider";

export const GEOMET_REQUEST_TIMEOUT_MS = 10_000;
export const GEOMET_BASE_URL = "https://geo.weather.gc.ca/geomet";
export const GEOMET_ATTRIBUTION =
  "Images radar © Environnement et Changement climatique Canada";

/** North American composite, 1 km. Transparent outside its coverage. */
export const GEOMET_RADAR_LAYER = "RADAR_1KM_RRAI";

/**
 * The composite is a 1 km grid, so past zoom 9 (about 200 m per pixel at our
 * latitudes) the service would only interpolate what the map can interpolate
 * itself — while every extra level quadruples the number of requests sent to a
 * public service. The map stretches the last level instead.
 */
export const GEOMET_MAX_TILE_ZOOM = 9;

/** Three observations: enough to read a cell's drift, cheap to fetch. */
const MAX_PAST_FRAMES = 3;

/**
 * FR-043 — Meteorological Service of Canada radar, through its GeoMet WMS.
 * Unlike a tiled service it renders any extent on demand, so there is no zoom
 * ceiling to blur past; it has no nowcast, so it answers with observations
 * only and the map simply offers no forecast frame.
 */
export class GeoMetRadarProvider implements RadarProvider {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string = GEOMET_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly layer: string = GEOMET_RADAR_LAYER,
    private readonly timeoutMs = GEOMET_REQUEST_TIMEOUT_MS,
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
  }

  async frames(): Promise<RadarFrames> {
    const capabilities = await this.requestCapabilities();
    const times = availableTimes(capabilities, MAX_PAST_FRAMES);

    if (times.length === 0) {
      throw new Error("Réponse radar invalide.");
    }

    return {
      frames: times.map((time) => this.toFrame(time)),
      attribution: GEOMET_ATTRIBUTION,
      maxZoom: GEOMET_MAX_TILE_ZOOM,
    };
  }

  private async requestCapabilities(): Promise<string> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("SERVICE", "WMS");
    url.searchParams.set("VERSION", "1.3.0");
    url.searchParams.set("REQUEST", "GetCapabilities");
    // Scoping to the one layer keeps the document small and leaves exactly one
    // time dimension in it.
    url.searchParams.set("LAYERS", this.layer);

    const response = await this.fetcher(url, {
      method: "GET",
      headers: { Accept: "application/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Radar HTTP ${response.status}`);
    }

    return response.text();
  }

  private toFrame(timeIso: string): RadarFrame {
    // MapLibre substitutes the extent; WIDTH and HEIGHT must match the raster
    // source's tileSize or the imagery lands at the wrong scale.
    const query = [
      "SERVICE=WMS",
      "VERSION=1.3.0",
      "REQUEST=GetMap",
      `LAYERS=${encodeURIComponent(this.layer)}`,
      "CRS=EPSG:3857",
      "BBOX={bbox-epsg-3857}",
      "WIDTH=256",
      "HEIGHT=256",
      "FORMAT=image/png",
      "TRANSPARENT=TRUE",
      "STYLES=",
      `TIME=${encodeURIComponent(timeIso)}`,
    ].join("&");

    return {
      id: `past-${timeIso}`,
      timeIso,
      kind: "past",
      tileUrlTemplate: `${this.baseUrl.toString()}?${query}`,
    };
  }
}

/**
 * The instants the service currently holds, oldest first. WMS states them as
 * `start/end/period`; the `default` attribute names the newest and is the
 * fallback when the extent cannot be read.
 */
export function availableTimes(capabilities: string, count: number): string[] {
  const dimension = /<Dimension[^>]*\bname="time"[^>]*>([^<]*)</i.exec(
    capabilities,
  );
  if (!dimension) {
    return [];
  }

  const latestAttribute = /\bdefault="([^"]+)"/i.exec(dimension[0])?.[1] ?? null;
  const extent = parseExtent(dimension[1] ?? "");

  if (!extent) {
    return latestAttribute ? [latestAttribute] : [];
  }

  const stepMs = extent.periodMs;
  const endMs = Date.parse(latestAttribute ?? extent.end);
  const startMs = Date.parse(extent.start);
  if (!Number.isFinite(endMs) || !Number.isFinite(startMs) || stepMs <= 0) {
    return latestAttribute ? [latestAttribute] : [];
  }

  const times: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const at = endMs - index * stepMs;
    if (at >= startMs) {
      times.push(new Date(at).toISOString().replace(/\.\d{3}Z$/, "Z"));
    }
  }
  return times;
}

function parseExtent(
  value: string,
): { start: string; end: string; periodMs: number } | null {
  const [start, end, period] = value.trim().split("/");
  if (!start || !end || !period) {
    return null;
  }
  const periodMs = parseIsoDurationMs(period);
  if (periodMs === null) {
    return null;
  }
  return { start, end, periodMs };
}

/** Only the time-of-day part; a radar step is never expressed in months. */
function parseIsoDurationMs(period: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(period.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = (hours * 3600 + minutes * 60 + seconds) * 1000;
  return total > 0 ? total : null;
}

function parseBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("RADAR_API_BASE_URL doit utiliser HTTP ou HTTPS.");
  }
  // The template is built by hand, so the base must carry no query of its own.
  url.search = "";
  return url;
}
