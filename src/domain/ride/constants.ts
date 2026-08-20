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
