/** FR-025 — announcement distances, configurable and tested. */
export const ANNOUNCEMENT_THRESHOLDS_M = {
  prepare: 500,
  approach: 150,
  imminent: 40,
} as const;

/** FR-024 — ignore GPS jitter that would bounce the active instruction. */
export const PROGRESS_HYSTERESIS_M = 35;

/**
 * FR-024 — on a loop the start and finish share a location. Prefer the
 * projection whose progress stays near the last fix (or the start).
 */
export const PROGRESS_MATCH_PENALTY_M_PER_KM = 250;

/** FR-024 / FR-026 — too coarse to advance a maneuver or trigger a reroute. */
export const LOW_ACCURACY_LIMIT_M = 80;

/** FR-026 — off-route distance is at least this, even with excellent GPS. */
export const OFF_ROUTE_MIN_THRESHOLD_M = 60;

export const OFF_ROUTE_ACCURACY_MULTIPLIER = 2;

/** FR-026 — several precise fixes, not a single outlier. */
export const OFF_ROUTE_CONSECUTIVE_FIXES = 3;

/** FR-026 — the excursion must last long enough to be real. */
export const OFF_ROUTE_MIN_DURATION_MS = 8_000;

/** FR-026 — do not hammer the routing provider after a reroute. */
export const RECALCULATE_COOLDOWN_MS = 30_000;

/**
 * FR-026 — a close parallel road or shortcut still advancing along the
 * corridor is not treated as a departure.
 */
export const PARALLEL_OR_SHORTCUT_MAX_M = 90;

/** FR-026 — rejoin further along the remaining loop / round-trip corridor. */
export const REJOIN_AHEAD_MIN_KM = 0.8;
export const REJOIN_AHEAD_FRACTION = 0.15;

export const GENERIC_CONTINUE_INSTRUCTION = "Continuez sur la route.";
