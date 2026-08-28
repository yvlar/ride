/** FR-039 — local parse only; reject oversized payloads (XXE / memory). */
export const GPX_MAX_FILE_BYTES = 5_000_000;

/** FR-039 — join / follow arrival, never a scattered magic number. */
export const GPX_JOIN_ARRIVAL_MIN_M = 30;

export const GPX_JOIN_ARRIVAL_ACCURACY_MULTIPLIER = 1.5;

/**
 * FR-039 — projections within this margin are treated as a tie and broken
 * by heading then GPX order.
 */
export const GPX_PROJECTION_TIE_M = 8;

/** FR-039 — heading disagreement, scaled 0–180° into metres of score. */
export const GPX_HEADING_PENALTY_M = 40;

/** FR-039 — extra score for a projection behind the last progress. */
export const GPX_REVERSE_PROGRESS_PENALTY_M = 80;

export const GPX_VERTEX_INSERT_EPS = 1e-6;

/**
 * FR-039 — HTML `accept` hint. iOS Files greys out unrecognized extensions
 * unless `application/octet-stream` is present (no GPX UTI on iOS).
 * Client code still requires a `.gpx` name or a known XML MIME type.
 */
export const GPX_FILE_ACCEPT =
  "application/octet-stream,.gpx,application/gpx+xml,application/xml,text/xml";

export const GPX_MIME_TYPES = [
  "application/gpx+xml",
  "application/xml",
  "text/xml",
] as const;

/**
 * FR-039 — confirmed GPX departure / return. GPS-aware, not scattered
 * magic numbers. Mirrors FR-026 so a noisy fix does not drop the trace.
 */
export const GPX_OFF_ROUTE_MIN_THRESHOLD_M = 60;
export const GPX_OFF_ROUTE_ACCURACY_MULTIPLIER = 2;
export const GPX_OFF_ROUTE_CONSECUTIVE_FIXES = 3;
export const GPX_OFF_ROUTE_MIN_DURATION_MS = 8_000;
export const GPX_REJOIN_COOLDOWN_MS = 15_000;

/** FR-041 — export d'un parcours enregistré. */
export const GPX_EXPORT_MIME_TYPE = "application/gpx+xml";
export const GPX_EXPORT_CREATOR = "Ride";
export const GPX_EXPORT_VERSION = "1.1";
export const GPX_EXPORT_NAMESPACE = "http://www.topografix.com/GPX/1/1";
export const GPX_EXPORT_SCHEMA_LOCATION =
  "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd";
/** ~1 cm : au-delà, seul le bruit GPS gagne des décimales. */
export const GPX_EXPORT_COORDINATE_DECIMALS = 7;
export const GPX_EXPORT_ELEVATION_DECIMALS = 1;
