import { describe, expect, it, vi } from "vitest";
import {
  GEOMET_ATTRIBUTION,
  GEOMET_BASE_URL,
  GEOMET_MAX_TILE_ZOOM,
  GeoMetRadarProvider,
  availableTimes,
} from "./geomet-radar-provider";

const CAPABILITIES = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0">
  <Layer queryable="1">
    <Name>RADAR_1KM_RRAI</Name>
    <Title>North American radar composite [1 km]</Title>
    <Dimension name="time" units="ISO8601" default="2026-08-29T13:18:00Z" nearestValue="0">2026-08-29T10:18:00Z/2026-08-29T13:18:00Z/PT6M</Dimension>
  </Layer>
</WMS_Capabilities>`;

function textFetch(body: string, status = 200) {
  return vi.fn<typeof fetch>(async () =>
    new Response(body, {
      status,
      headers: { "Content-Type": "application/xml" },
    }),
  );
}

function provider(body: string, status = 200) {
  return new GeoMetRadarProvider(
    GEOMET_BASE_URL,
    textFetch(body, status) as unknown as typeof fetch,
  );
}

describe("GeoMetRadarProvider (FR-043)", () => {
  it("asks the service which instants it holds", async () => {
    const fetcher = textFetch(CAPABILITIES);
    const radar = new GeoMetRadarProvider(
      GEOMET_BASE_URL,
      fetcher as unknown as typeof fetch,
    );

    await radar.frames();

    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get("REQUEST")).toBe("GetCapabilities");
    // Scoping the document keeps exactly one time dimension in it.
    expect(url.searchParams.get("LAYERS")).toBe("RADAR_1KM_RRAI");
  });

  it("offers the latest observations, oldest first", async () => {
    const frames = await provider(CAPABILITIES).frames();

    expect(frames.frames.map((frame) => frame.timeIso)).toEqual([
      "2026-08-29T13:06:00Z",
      "2026-08-29T13:12:00Z",
      "2026-08-29T13:18:00Z",
    ]);
    expect(frames.frames.every((frame) => frame.kind === "past")).toBe(true);
  });

  it("builds a WMS template the map fills in per tile", async () => {
    const frames = await provider(CAPABILITIES).frames();
    const url = new URL(frames.frames.at(-1)!.tileUrlTemplate);

    expect(url.origin + url.pathname).toBe(GEOMET_BASE_URL);
    expect(url.searchParams.get("REQUEST")).toBe("GetMap");
    expect(url.searchParams.get("CRS")).toBe("EPSG:3857");
    expect(url.searchParams.get("TIME")).toBe("2026-08-29T13:18:00Z");
    expect(url.searchParams.get("TRANSPARENT")).toBe("TRUE");
    // The map substitutes the extent; the size must match the raster tileSize.
    expect(frames.frames.at(-1)!.tileUrlTemplate).toContain(
      "BBOX={bbox-epsg-3857}",
    );
    expect(url.searchParams.get("WIDTH")).toBe("256");
    expect(url.searchParams.get("HEIGHT")).toBe("256");
  });

  it("declares the zoom past which the 1 km grid says nothing new", async () => {
    const frames = await provider(CAPABILITIES).frames();

    expect(frames.maxZoom).toBe(GEOMET_MAX_TILE_ZOOM);
    expect(frames.attribution).toBe(GEOMET_ATTRIBUTION);
  });

  it("keeps a base URL free of its own query string", async () => {
    const radar = new GeoMetRadarProvider(
      `${GEOMET_BASE_URL}?lang=en`,
      textFetch(CAPABILITIES) as unknown as typeof fetch,
    );

    const frames = await radar.frames();

    expect(frames.frames[0]!.tileUrlTemplate).not.toContain("lang=en");
  });

  it("reports an HTTP failure in French", async () => {
    await expect(provider("", 503).frames()).rejects.toThrow("Radar HTTP 503");
  });

  it("rejects a document with no time dimension", async () => {
    await expect(
      provider("<WMS_Capabilities></WMS_Capabilities>").frames(),
    ).rejects.toThrow("Réponse radar invalide.");
  });

  it("refuses a base URL that is not HTTP", () => {
    expect(() => new GeoMetRadarProvider("ftp://example.test")).toThrow(
      "RADAR_API_BASE_URL",
    );
  });
});

describe("availableTimes (FR-043)", () => {
  it("walks back from the newest instant by the stated period", () => {
    expect(availableTimes(CAPABILITIES, 3)).toEqual([
      "2026-08-29T13:06:00Z",
      "2026-08-29T13:12:00Z",
      "2026-08-29T13:18:00Z",
    ]);
  });

  it("never reaches back before the service's own window", () => {
    const short = CAPABILITIES.replace(
      "2026-08-29T10:18:00Z/2026-08-29T13:18:00Z/PT6M",
      "2026-08-29T13:12:00Z/2026-08-29T13:18:00Z/PT6M",
    );

    expect(availableTimes(short, 3)).toEqual([
      "2026-08-29T13:12:00Z",
      "2026-08-29T13:18:00Z",
    ]);
  });

  it("understands an hourly period too", () => {
    const hourly = CAPABILITIES.replace("PT6M", "PT1H");

    expect(availableTimes(hourly, 2)).toEqual([
      "2026-08-29T12:18:00Z",
      "2026-08-29T13:18:00Z",
    ]);
  });

  it("falls back to the default instant when the extent is unreadable", () => {
    const broken = CAPABILITIES.replace(
      "2026-08-29T10:18:00Z/2026-08-29T13:18:00Z/PT6M",
      "sans-objet",
    );

    expect(availableTimes(broken, 3)).toEqual(["2026-08-29T13:18:00Z"]);
  });

  it("has nothing to offer without a time dimension", () => {
    expect(availableTimes("<WMS_Capabilities/>", 3)).toEqual([]);
  });
});
