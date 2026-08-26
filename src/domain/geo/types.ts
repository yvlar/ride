export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type PlaceType = "address" | "city" | "postal_code" | "place";

export type Place = {
  id?: string;
  label: string;
  coordinates: Coordinates;
  /** Short name that distinguishes similar results (FR-032). */
  name?: string;
  /** Street or address line when distinct from `name`. */
  addressLine?: string;
  fullAddress?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
  type?: PlaceType;
  source?: "search" | "map";
  precision?: "exact" | "approximate";
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
