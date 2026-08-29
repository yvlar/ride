import { z } from "zod";
import type { RadarFrame, RadarFrames } from "@/domain/weather/types";
import type { RadarProvider } from "./weather-provider";

export const RADAR_REQUEST_TIMEOUT_MS = 7_000;
export const RAINVIEWER_BASE_URL = "https://api.rainviewer.com/public/";
export const RAINVIEWER_ATTRIBUTION = "Images radar © RainViewer";

/** Tile size / colour scheme / smoothing + snow, RainViewer's own defaults. */
const TILE_SUFFIX = "256/{z}/{x}/{y}/2/1_1.png";

/**
 * RainViewer's public tiles stop at zoom 7: deeper requests answer 200 with a
 * "Zoom Level Not Supported" image, which would paint grey banners over the
 * route. Declaring the ceiling makes the map upscale the last real tile.
 */
export const RAINVIEWER_MAX_TILE_ZOOM = 7;

/** Two observations back is enough to read the drift without a slideshow. */
const MAX_PAST_FRAMES = 3;
const MAX_FORECAST_FRAMES = 3;

const frameSchema = z.object({
  time: z.number(),
  path: z.string().min(1),
});

const mapsSchema = z.object({
  host: z.string().min(1).optional(),
  radar: z
    .object({
      past: z.array(frameSchema).optional(),
      nowcast: z.array(frameSchema).optional(),
    })
    .optional(),
});

/**
 * FR-043 — RainViewer's public map index. It carries observed frames and a
 * short nowcast, which is what actually answers "where is this cell going".
 * The endpoint is keyless; a key is only sent when one is configured.
 */
export class RainViewerRadarProvider implements RadarProvider {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string = RAINVIEWER_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiKey?: string,
    private readonly timeoutMs = RADAR_REQUEST_TIMEOUT_MS,
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
  }

  async frames(): Promise<RadarFrames> {
    const url = new URL("weather-maps.json", this.baseUrl);
    if (this.apiKey) {
      url.searchParams.set("apikey", this.apiKey);
    }

    const response = await this.fetcher(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        response.ok
          ? "Réponse radar invalide."
          : `Radar HTTP ${response.status}`,
      );
    }

    if (!response.ok) {
      throw new Error(`Radar HTTP ${response.status}`);
    }

    const parsed = mapsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse radar invalide.");
    }

    const host = stripTrailingSlash(parsed.data.host ?? this.baseUrl.origin);
    const past = (parsed.data.radar?.past ?? []).slice(-MAX_PAST_FRAMES);
    const forecast = (parsed.data.radar?.nowcast ?? []).slice(
      0,
      MAX_FORECAST_FRAMES,
    );

    return {
      frames: [
        ...past.map((frame) => toFrame(host, frame, "past")),
        ...forecast.map((frame) => toFrame(host, frame, "forecast")),
      ],
      attribution: RAINVIEWER_ATTRIBUTION,
      maxZoom: RAINVIEWER_MAX_TILE_ZOOM,
    };
  }
}

function toFrame(
  host: string,
  frame: z.infer<typeof frameSchema>,
  kind: RadarFrame["kind"],
): RadarFrame {
  const path = frame.path.startsWith("/") ? frame.path : `/${frame.path}`;
  return {
    id: `${kind}-${frame.time}`,
    timeIso: new Date(frame.time * 1000).toISOString(),
    kind,
    tileUrlTemplate: `${host}${path}/${TILE_SUFFIX}`,
  };
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function parseBaseUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("RADAR_API_BASE_URL doit utiliser HTTP ou HTTPS.");
  }
  return url;
}
