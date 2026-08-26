export type Coordinates = {
  latitude: number;
  longitude: number;
};

/** FR-038 — how a destination was expressed, so the UI can label it. */
export type PlaceKind = "address" | "city" | "postal_code" | "place";

/**
 * FR-038 — `approximate` marks a zone centroid (postal code, municipality)
 * rather than a precise point. The rider may adjust it before generating.
 */
export type PlacePrecision = "exact" | "approximate";

/** FR-038 — a destination comes from the search field or from the map. */
export type PlaceSource = "search" | "map";

export type Place = {
  label: string;
  coordinates: Coordinates;
  /** Short name that distinguishes similar results (FR-032). */
  name?: string;
  /** Street or address line when distinct from `name`. */
  addressLine?: string;
  /** Municipality (FR-038). */
  locality?: string;
  /** Province or state (FR-038). */
  region?: string;
  postalCode?: string;
  country?: string;
  kind?: PlaceKind;
  precision?: PlacePrecision;
  source?: PlaceSource;
  /** Provider identifier, when one is available. Never generated locally. */
  id?: string;
  /** Extent of an approximate result, so the map can show the zone (FR-038). */
  bounds?: BoundingBox;
};

/** GeoJSON position: [longitude, latitude] */
export type Position = [number, number];

export type LineString = {
  type: "LineString";
  coordinates: Position[];
};

/** Axis-aligned geographic box. Independent of any map SDK (FR-013, BR-004). */
export type BoundingBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};
