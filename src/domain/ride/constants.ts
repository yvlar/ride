/** BR-001 — MVP distance tolerance around the requested or estimated distance. */
export const DISTANCE_TOLERANCE_PERCENT = 10;

/** A loop is closed if both ends are within this distance of the requested start. */
export const LOOP_CLOSURE_TOLERANCE_KM = 0.15;

/** BR-002 — warn when a substantial share of the loop reuses the same roadway. */
export const HIGH_REPEAT_WARNING_PERCENT = 25;

/** Radius CV below this threshold means the trace is too close to a geometric circle. */
export const CIRCULARITY_CV_THRESHOLD = 0.06;

/** Road-network traces must include intermediate vertices, not just waypoints. */
export const MIN_ROAD_NETWORK_POINTS = 8;

/**
 * A destination trace follows a network if it has at least the two endpoints
 * of a road segment. A single segment (start → destination) is valid (FR-002).
 */
export const MIN_DESTINATION_ROAD_POINTS = 2;

/**
 * Scenic may prefer a modest extra length over the shortest path, but must
 * not maximize detour up to MAX_DESTINATION_DETOUR_RATIO (FR-002).
 */
export const SCENIC_PREFERRED_MAX_RATIO = 1.2;

/**
 * BR-005 — average speeds used to convert an available duration into a distance.
 * Adjustable domain constants; not delegated to a routing provider.
 */
export const AVERAGE_SPEED_KMH = {
  curvy: 50,
  scenic: 65,
  touring: 80,
} as const;

/** Spatial cell size for matching the same roadway in either direction. */
export const OVERLAP_CELL_KM = 0.05;

/** Start and destination must be farther apart than this for FR-002. */
export const MIN_DESTINATION_SEPARATION_KM = 1;

/**
 * A destination route is anchored if both ends snap within this distance
 * of the requested places (provider network snapping). The point must also
 * be closer to the intended place than to the other endpoint, so a trace
 * that returns to the start cannot satisfy a nearby destination (FR-002).
 */
export const DESTINATION_ENDPOINT_TOLERANCE_KM = 2.5;

/**
 * Without a target length, a candidate longer than this ratio of the
 * shortest valid route is a disproportionate detour (FR-002).
 */
export const MAX_DESTINATION_DETOUR_RATIO = 1.75;

/**
 * Touring prefers a moderate heading change rather than the twistiest
 * corridor or the purely fastest trace (FR-002 / BR-003).
 */
export const TOURING_TARGET_HEADING_CHANGE_PER_KM = 0.8;

/**
 * FR-004 — Curvy ranking. Scenic / preference weights from CURSOR.md are
 * omitted here: they belong to FR-005 / FR-007 / FR-008, not this FR.
 */
export const CURVY_STRAIGHT_HEADING_DEG = 8;
export const CURVY_SIGNIFICANT_TURN_DEG = 25;
export const CURVY_REVERSAL_DEG = 150;
export const CURVY_HEADING_CHANGE_PER_KM_FOR_MAX = 6;
export const CURVY_TURNS_PER_KM_FOR_MAX = 0.25;
export const CURVY_STRAIGHT_SCORE_WEIGHT = 0.55;
export const CURVY_ELEVATION_M_PER_KM_FOR_MAX = 30;
export const CURVY_UNKNOWN_ELEVATION_SCORE = 50;
export const CURVY_WEIGHT_CURVES = 0.45;
export const CURVY_WEIGHT_SECONDARY = 0.25;
export const CURVY_WEIGHT_ELEVATION = 0.15;
export const CURVY_WEIGHT_HIGHWAY_AVOIDANCE = 0.15;

export const CURVY_HIGHWAY_ROAD_CLASSES = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
] as const;

export const CURVY_SECONDARY_ROAD_CLASSES = [
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
] as const;
