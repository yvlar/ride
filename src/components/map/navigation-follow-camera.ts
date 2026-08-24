import {
  coordinatesToPosition,
  offsetCoordinates,
} from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";

/** Street-level follow camera while GeolocateControl is off (FR-024, FR-028). */
export const NAVIGATION_FOLLOW_ZOOM = 17;
export const NAVIGATION_FOLLOW_PITCH = 60;
export const NAVIGATION_MAX_PITCH = 85;
export const NAVIGATION_FOLLOW_LOOKAHEAD_KM = 0.08;
export const NAVIGATION_FOLLOW_DURATION_MS = 400;
export const NAVIGATION_FOLLOW_PADDING = {
  top: 160,
  bottom: 240,
  left: 40,
  right: 40,
} as const;

export type NavigationFollowCenter = { lng: number; lat: number };

export type NavigationFollowCamera = {
  center: NavigationFollowCenter;
  zoom: number;
  pitch: number;
  bearing?: number;
  padding: typeof NAVIGATION_FOLLOW_PADDING;
  duration: number;
  essential: true;
};

export function wrapHeadingDeg(headingDeg: number): number {
  return ((headingDeg % 360) + 360) % 360;
}

export function finiteHeadingDeg(
  headingDeg: number | null | undefined,
): number | null {
  if (typeof headingDeg !== "number" || !Number.isFinite(headingDeg)) {
    return null;
  }
  return wrapHeadingDeg(headingDeg);
}

/** Look ~80 m down the heading so more road is visible ahead of the puck. */
export function navigationFollowCenter(
  coordinates: Coordinates,
  headingDeg: number | null,
): NavigationFollowCenter {
  if (headingDeg == null) {
    const [lng, lat] = coordinatesToPosition(coordinates);
    return { lng, lat };
  }
  const ahead = offsetCoordinates(
    coordinates,
    headingDeg,
    NAVIGATION_FOLLOW_LOOKAHEAD_KM,
  );
  const [lng, lat] = coordinatesToPosition(ahead);
  return { lng, lat };
}

export function navigationFollowCamera(
  coordinates: Coordinates,
  headingDeg: number | null,
): NavigationFollowCamera {
  const camera: NavigationFollowCamera = {
    center: navigationFollowCenter(coordinates, headingDeg),
    zoom: NAVIGATION_FOLLOW_ZOOM,
    pitch: NAVIGATION_FOLLOW_PITCH,
    padding: NAVIGATION_FOLLOW_PADDING,
    duration: NAVIGATION_FOLLOW_DURATION_MS,
    essential: true,
  };
  if (headingDeg != null) {
    camera.bearing = headingDeg;
  }
  return camera;
}
