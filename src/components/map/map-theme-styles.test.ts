import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_MAP_STYLE } from "./fallback-style";
import {
  DARK_MAP_STYLE_URL,
  SATELLITE_MAP_STYLE,
  TERRAIN_MAP_STYLE,
  mapThemeStyle,
} from "./map-theme-styles";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mapThemeStyle (FR-045)", () => {
  it("keeps the OSM raster fallback for the light theme without a configured style", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "");
    expect(mapThemeStyle("light")).toBe(FALLBACK_MAP_STYLE);
  });

  it("uses NEXT_PUBLIC_MAP_STYLE_URL as the light basemap", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "https://tiles.example.test/liberty");
    expect(mapThemeStyle("light")).toBe("https://tiles.example.test/liberty");
  });

  it("ignores the configured style for the other themes", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "https://tiles.example.test/liberty");
    expect(mapThemeStyle("dark")).toBe(DARK_MAP_STYLE_URL);
    expect(mapThemeStyle("satellite")).toBe(SATELLITE_MAP_STYLE);
    expect(mapThemeStyle("terrain")).toBe(TERRAIN_MAP_STYLE);
  });

  it("attributes every built-in raster theme (CURSOR.md §21)", () => {
    for (const style of [SATELLITE_MAP_STYLE, TERRAIN_MAP_STYLE]) {
      const sources = Object.values(style.sources);
      expect(sources).toHaveLength(1);
      const source = sources[0] as { attribution?: string; tiles?: string[] };
      expect(source.attribution).toBeTruthy();
      expect(source.tiles?.[0]).toMatch(/^https:\/\//);
    }
  });
});
