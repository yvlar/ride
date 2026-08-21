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
