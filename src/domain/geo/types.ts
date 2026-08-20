export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type Place = {
  label: string;
  coordinates: Coordinates;
};

/** GeoJSON position: [longitude, latitude] */
export type Position = [number, number];

export type LineString = {
  type: "LineString";
  coordinates: Position[];
};
