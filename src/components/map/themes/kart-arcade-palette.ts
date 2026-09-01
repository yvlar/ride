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
  urban: "#C7E39A",
  forest: "#2F8F46",
  forestDark: "#176B35",
  park: "#5FBE66",
  water: "#42CFF5",
  waterDeep: "#159FCB",
  waterEdge: "#0E7FA6",
  /** Pale band where the water meets the shore, as in the reference render. */
  waterShallow: "#8FE6FA",
  sand: "#F4E3B0",
  ice: "#E8F7FB",

  /*
   * Roads are asphalt, not cream: the reference render draws a dark roadway
   * with a bright yellow centre line and white guardrails, and that contrast
   * is what makes the ribbon read as a racing circuit. The warm hues of the
   * original brief survive where they belong — on the markings and the edges.
   */
  asphalt: "#48545F",
  asphaltMinor: "#5E6B77",
  /*
   * Zoomed out, a road is a two-pixel thread: asphalt on green vanishes, so
   * the warm arcade hues carry the hierarchy until the roadway is wide enough
   * to be a surface. The style crossfades between the two.
   */
  roadFar: "#FFF2C2",
  roadFarMain: "#FFD447",
  /** Yellow centre line of a main road. */
  roadLine: "#FFD447",
  /** White guardrail running along both sides. */
  guardrail: "#FFF9E8",
  /** A motorway keeps the coral accent, carried by its rail and its markings. */
  motorway: "#FF665A",
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
