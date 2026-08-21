import type { Coordinates, LineString } from "@/domain/geo/types";
import type {
  RideStyle,
  RoutePreferences,
  RouteSegment,
} from "@/domain/ride/types";

export type ProviderRouteRequest = {
  start: Coordinates;
  destination: Coordinates;
  waypoints?: Coordinates[];
  style?: RideStyle;
  preferences?: RoutePreferences;
};

export type ProviderRouteResult = {
  geometry: LineString;
  segments: RouteSegment[];
  distanceKm: number;
  durationMinutes: number;
};

/**
 * BR-004 / NFR-005 — routing is accessed only through this replaceable port.
 * Domain code must not import a named map or routing vendor.
 */
export interface RoutingProvider {
  calculateRoute(input: ProviderRouteRequest): Promise<ProviderRouteResult>;
}
