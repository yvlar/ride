import type { Coordinates, LineString } from "@/domain/geo/types";
import type { NavigationStep } from "@/domain/navigation/types";
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
  steps?: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
};

export type RoutingProviderOptions = {
  signal?: AbortSignal;
};

/**
 * BR-004 / NFR-005 — routing is accessed only through this replaceable port.
 * Domain code must not import a named map or routing vendor.
 */
export interface RoutingProvider {
  calculateRoute(
    input: ProviderRouteRequest,
    options?: RoutingProviderOptions,
  ): Promise<ProviderRouteResult>;
}
