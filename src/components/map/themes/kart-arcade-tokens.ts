export const KART_ARCADE_COLORS = {
  terrain: "#8ED081",
  terrainLight: "#B7E58A",
  forest: "#2F8F46",
  forestDark: "#176B35",
  water: "#42CFF5",
  waterDeep: "#159FCB",
  localRoad: "#FFF2C2",
  mainRoad: "#FFD447",
  highway: "#FF665A",
  roadCasing: "#FFF9E8",
  building: "#F39A62",
  buildingSecondary: "#FFD2A6",
  tunnel: "#6F5AA8",
  activeRoute: "#147DFF",
  activeRouteHalo: "#FFFFFF",
  primaryText: "#17324D",
  secondaryText: "#46657A",
} as const;

export const KART_ARCADE_STYLE_TOKENS = {
  "__KA_TERRAIN__": KART_ARCADE_COLORS.terrain,
  "__KA_TERRAIN_LIGHT__": KART_ARCADE_COLORS.terrainLight,
  "__KA_FOREST__": KART_ARCADE_COLORS.forest,
  "__KA_FOREST_DARK__": KART_ARCADE_COLORS.forestDark,
  "__KA_WATER__": KART_ARCADE_COLORS.water,
  "__KA_WATER_DEEP__": KART_ARCADE_COLORS.waterDeep,
  "__KA_LOCAL_ROAD__": KART_ARCADE_COLORS.localRoad,
  "__KA_MAIN_ROAD__": KART_ARCADE_COLORS.mainRoad,
  "__KA_HIGHWAY__": KART_ARCADE_COLORS.highway,
  "__KA_ROAD_CASING__": KART_ARCADE_COLORS.roadCasing,
  "__KA_BUILDING__": KART_ARCADE_COLORS.building,
  "__KA_BUILDING_SECONDARY__": KART_ARCADE_COLORS.buildingSecondary,
  "__KA_TUNNEL__": KART_ARCADE_COLORS.tunnel,
  "__KA_PRIMARY_TEXT__": KART_ARCADE_COLORS.primaryText,
  "__KA_SECONDARY_TEXT__": KART_ARCADE_COLORS.secondaryText,
} as const;

export const KART_ARCADE_ROUTE_PAINT = {
  color: KART_ARCADE_COLORS.activeRoute,
  halo: KART_ARCADE_COLORS.activeRouteHalo,
  traveled: "#5C7185",
  connector: "#FF8A3D",
} as const;

/** Makes the road network easier to read through a visor and in full sun. */
export const KART_ARCADE_ROAD_WIDTH_SCALE = 2;
