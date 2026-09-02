import { describe, expect, it } from "vitest";
import { KART_ARCADE_PALETTE } from "./themes/kart-arcade-palette";
import {
  KART_ARCADE_MAP_OVERLAY_THEME,
  STANDARD_MAP_OVERLAY_THEME,
  mapThemeOverlay,
} from "./map-theme-overlay";

describe("mapThemeOverlay (FR-046)", () => {
  it("leaves the built-in themes exactly as they were", () => {
    for (const theme of ["light", "dark", "satellite", "terrain"] as const) {
      expect(mapThemeOverlay(theme)).toBe(STANDARD_MAP_OVERLAY_THEME);
    }
    expect(STANDARD_MAP_OVERLAY_THEME.route).toMatchObject({
      color: "#38bdf8",
      width: 4,
      casingColor: null,
      traveledColor: "#64748b",
      connectorColor: "#f59e0b",
    });
  });

  it("gives Kart Arcade an electric blue route over a white halo", () => {
    const overlay = mapThemeOverlay("kart-arcade");
    expect(overlay).toBe(KART_ARCADE_MAP_OVERLAY_THEME);
    expect(overlay.route.color).toBe(KART_ARCADE_PALETTE.route);
    expect(overlay.route.casingColor).toBe(KART_ARCADE_PALETTE.routeHalo);
    // The halo has to be visible on both sides of the route.
    expect(overlay.route.casingWidth).toBeGreaterThan(overlay.route.width);
  });

  it("keeps the route distinct from the roads and the water it crosses", () => {
    const route = mapThemeOverlay("kart-arcade").route.color;
    for (const conflicting of [
      KART_ARCADE_PALETTE.water,
      KART_ARCADE_PALETTE.waterDeep,
      KART_ARCADE_PALETTE.roadLine,
      KART_ARCADE_PALETTE.motorway,
      KART_ARCADE_PALETTE.asphalt,
    ]) {
      expect(route).not.toBe(conflicting);
    }
  });

  it("names a container class so the DOM markers follow the theme", () => {
    expect(mapThemeOverlay("kart-arcade").containerClassName).toBe(
      "ride-map-kart-arcade",
    );
    expect(mapThemeOverlay("dark").containerClassName).toBeUndefined();
  });
});
