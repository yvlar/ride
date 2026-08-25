import type { Coordinates, LineString, Place } from "@/domain/geo/types";
import type { NavigationStep } from "@/domain/navigation/types";
import type { RideStyle, RouteSegment } from "@/domain/ride/types";

export type GpxTrackKind = "track" | "route";

export type GpxNavigationPhase =
  | "gpx_preview"
  | "joining_gpx"
  | "following_gpx"
  | "gpx_completed";

export type GpxPoint = {
  coordinates: Coordinates;
  elevationM?: number;
  time?: string;
  name?: string;
};

export type GpxPart = {
  points: GpxPoint[];
};

export type ParsedGpxTrip = {
  id: string;
  kind: GpxTrackKind;
  name: string;
  description?: string;
  parts: GpxPart[];
};

export type GpxParseErrorCode =
  | "EMPTY"
  | "TOO_LARGE"
  | "UNSAFE_XML"
  | "CORRUPT"
  | "NO_TRIP"
  | "WAYPOINTS_ONLY"
  | "OUT_OF_BOUNDS";

export type GpxParseError = {
  code: GpxParseErrorCode;
  message: string;
};

export type GpxParseResult =
  | {
      ok: true;
      trips: ParsedGpxTrip[];
      warnings: string[];
      waypointCount: number;
    }
  | { ok: false; error: GpxParseError };

export type GpxEntryPoint = {
  point: Coordinates;
  segmentIndex: number;
  t: number;
  progressKm: number;
  distanceM: number;
};

export type GeneratedGpxRoute = {
  id: string;
  type: "gpx";
  source: "gpx";
  name: string;
  start: Place;
  destination: Place;
  style: RideStyle;
  geometry: LineString;
  parts: LineString[];
  /** Vertex indices whose inbound segment is a gap between trkseg parts. */
  gapBeforeVertex: number[];
  segments: RouteSegment[];
  steps?: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
  warnings: string[];
  isClosedLoop: boolean;
  trackKind: GpxTrackKind;
  originalGeometry: LineString;
  originalParts: LineString[];
};

export type GpxRideRequest = {
  type: "gpx";
  start: Place;
  destination: Place;
  name: string;
  style?: "curvy" | "scenic" | "touring";
  preferences?: {
    avoidHighways: boolean;
    avoidUnpaved: boolean;
    stayInCanada?: boolean;
  };
};

export type GpxMapOverlay = {
  phase: GpxNavigationPhase;
  connectorGeometry: LineString | null;
  entryPoint: Coordinates | null;
};

export function isGpxRoute(route: { type: string }): route is GeneratedGpxRoute {
  return route.type === "gpx";
}

export function isGpxRequest(request: { type: string }): request is GpxRideRequest {
  return request.type === "gpx";
}
