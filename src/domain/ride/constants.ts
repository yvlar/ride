/** BR-001 — MVP distance tolerance around the requested or estimated distance. */
export const DISTANCE_TOLERANCE_PERCENT = 10;

/** A loop is closed if both ends are within this distance of the requested start. */
export const LOOP_CLOSURE_TOLERANCE_KM = 0.15;

/** BR-002 — warn when a substantial share of the loop reuses the same roadway. */
export const HIGH_REPEAT_WARNING_PERCENT = 25;

/**
 * BR-006 — implementation heuristic for a visibly different corridor (CURSOR.md).
 * The MVP spec does not freeze a contractual overlap percentage.
 */
export const REGENERATION_MAX_OVERLAP_PERCENT = 30;

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
 * FR-005 — Scenic ranking. Preference-toggle weights from CURSOR.md belong
 * to FR-007 / FR-008, not this FR. The remaining slice is highway /
 * industrial avoidance, which is part of scenic character.
 *
 * Landscape scores are a heuristic rank, never a precise measurement.
 */
export const SCENIC_WEIGHT_LANDSCAPE = 0.45;
export const SCENIC_WEIGHT_RURAL = 0.2;
export const SCENIC_WEIGHT_CURVES = 0.2;
export const SCENIC_WEIGHT_AVOIDANCE = 0.15;
export const SCENIC_MOUNTAIN_M_PER_KM_FOR_MAX = 30;

export const SCENIC_HIGHWAY_ROAD_CLASSES = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
] as const;

export const SCENIC_RURAL_ROAD_CLASSES = [
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
] as const;

export const SCENIC_INDUSTRIAL_ROAD_CLASSES = [
  "industrial",
  "service",
] as const;

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
 * FR-006 — Touring ranking. Scenic / preference-toggle weights from
 * CURSOR.md belong to FR-005 / FR-007 / FR-008, not this FR.
 *
 * Fluidity peaks at a moderate heading change: more stable than Curvy,
 * not a shortest-time / motorway commute (BR-003).
 */
export const TOURING_TARGET_HEADING_CHANGE_PER_KM = 2.5;
export const TOURING_FLUIDITY_SPREAD_PER_KM = 10;
export const TOURING_WEIGHT_FLUIDITY = 0.25;
export const TOURING_WEIGHT_SECONDARY = 0.3;
export const TOURING_WEIGHT_COMFORT = 0.25;
export const TOURING_WEIGHT_HIGHWAY_AVOIDANCE = 0.2;

export const TOURING_HIGHWAY_ROAD_CLASSES = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
] as const;

export const TOURING_SECONDARY_ROAD_CLASSES = [
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
] as const;

/**
 * FR-004 — Curvy ranking. Scenic / preference weights from CURSOR.md are
 * omitted here: they belong to FR-005 / FR-007 / FR-008, not this FR.
 */
export const CURVY_STRAIGHT_HEADING_DEG = 8;
export const CURVY_SIGNIFICANT_TURN_DEG = 25;
/** Near-180° out-and-back. Hairpins (~160°) stay significant turns (FR-004). */
export const CURVY_REVERSAL_DEG = 170;
export const CURVY_HEADING_CHANGE_PER_KM_FOR_MAX = 6;
export const CURVY_TURNS_PER_KM_FOR_MAX = 0.25;
export const CURVY_STRAIGHT_SCORE_WEIGHT = 0.55;
export const CURVY_ELEVATION_M_PER_KM_FOR_MAX = 30;
/**
 * FR-004 — unknown elevation is neutral. A mid-scale default (e.g. 50 ≈ 15 m/km)
 * invents relief and lets unlabeled routes outrank a known modest climb.
 */
export const CURVY_UNKNOWN_ELEVATION_SCORE = 0;
export const CURVY_WEIGHT_CURVES = 0.45;
export const CURVY_WEIGHT_SECONDARY = 0.25;
export const CURVY_WEIGHT_ELEVATION = 0.15;
export const CURVY_WEIGHT_HIGHWAY_AVOIDANCE = 0.15;

/**
 * FR-007 — provider-agnostic highway classes. Adapters map their own
 * labels onto these tokens; the domain never names a map vendor.
 */
export const HIGHWAY_ROAD_CLASSES = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
] as const;

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
