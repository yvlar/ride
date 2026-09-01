/**
 * FR-046 — the single source of truth for the Kart Arcade colours. Every layer
 * of the style, every overlay token and the marker stylesheet read from here,
 * so a hue is never re-typed in a component.
 *
 * The palette is an original arcade-racing interpretation of an OpenStreetMap
 * basemap. It borrows nothing from any published game.
 */
export const KART_ARCADE_PALETTE = {
  /** Ground the whole map sits on. */
  land: "#8ED081",
  landLight: "#B7E58A",
  /** Built-up ground, so a town reads as a town and not as a field. */
  urban: "#D8E9B4",
  forest: "#2F8F46",
  forestDark: "#176B35",
  park: "#5FBE66",
  water: "#42CFF5",
  waterDeep: "#159FCB",
  waterEdge: "#0E7FA6",
  sand: "#F4E3B0",
  ice: "#E8F7FB",
  roadLocal: "#FFF2C2",
  roadMain: "#FFD447",
  motorway: "#FF665A",
  roadCasing: "#FFF9E8",
  /** Casing under a warm road needs a darker edge to stay a shape, not a glow. */
  roadEdge: "#C8A33C",
  motorwayEdge: "#C8402F",
  track: "#E4C89A",
  path: "#B98C5A",
  railway: "#7B6A9C",
  building: "#F39A62",
  buildingSecondary: "#FFD2A6",
  buildingEdge: "#C86F3E",
  tunnel: "#6F5AA8",
  route: "#147DFF",
  routeHalo: "#FFFFFF",
  routeTraveled: "#5B7FA6",
  connector: "#FF9F1C",
  textPrimary: "#17324D",
  textSecondary: "#46657A",
  textHalo: "#FFFFFF",
} as const;

export type KartArcadePalette = typeof KART_ARCADE_PALETTE;
