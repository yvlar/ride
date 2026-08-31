import { z } from "zod";
import { haversineKm, lineStringLengthKm } from "@/domain/geo/distance";
import { MIN_DESTINATION_SEPARATION_KM } from "./constants";
import { DEFAULT_ROUTE_PREFERENCES } from "./stored-route-preferences";
import {
  isTargetDistanceRequired,
  parseTargetDistanceKm,
} from "./target-distance";
import type {
  DestinationRideRequest,
  LoopRideRequest,
  RoundTripRideRequest,
} from "./types";

/** FR-009 — business distance is always a positive length in kilometres. */
const targetDistanceKmSchema = z.number().gt(0).max(2000);

/** FR-010 — available duration is an optional positive length in minutes. */
const availableDurationMinutesSchema = z.number().gt(0).max(24 * 60);

const coordinatesSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
});

const boundingBoxSchema = z.object({
  west: z.number(),
  south: z.number(),
  east: z.number(),
  north: z.number(),
});

const placeSchema = z.object({
  label: z.string().min(1),
  coordinates: coordinatesSchema,
  name: z.string().min(1).optional(),
  addressLine: z.string().min(1).optional(),
  locality: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  // FR-038 — descriptive fields survive the round trip so the preview can
  // label the destination the way the rider selected it. Routing itself only
  // ever reads `coordinates`.
  postalCode: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  kind: z.enum(["address", "city", "postal_code", "place"]).optional(),
  precision: z.enum(["exact", "approximate"]).optional(),
  source: z.enum(["search", "map"]).optional(),
  id: z.string().min(1).optional(),
  bounds: boundingBoxSchema.optional(),
});

export const rideStyleSchema = z.enum([
  "curvy",
  "scenic",
  "touring",
  "fastest",
]);

const routePreferencesSchema = z.object({
  avoidHighways: z.boolean(),
  avoidUnpaved: z.boolean(),
  stayInCanada: z.boolean().optional(),
});

export const loopRideRequestSchema = z
  .object({
    type: z.literal("loop"),
    start: placeSchema,
    targetDistanceKm: targetDistanceKmSchema.optional(),
    availableDurationMinutes: availableDurationMinutesSchema.optional(),
    style: rideStyleSchema.optional(),
    preferences: routePreferencesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const parsedDistance = parseTargetDistanceKm(data.targetDistanceKm, {
      required: isTargetDistanceRequired(
        "loop",
        data.availableDurationMinutes !== undefined,
      ),
    });
    if (!parsedDistance.ok) {
      ctx.addIssue(
        "Une boucle exige une distance cible (FR-009) ou une durée disponible (FR-001).",
      );
    }
  });

export type ParsedLoopRideRequest = z.infer<typeof loopRideRequestSchema>;

export const destinationRideRequestSchema = z
  .object({
    type: z.literal("destination"),
    start: placeSchema,
    destination: placeSchema,
    targetDistanceKm: targetDistanceKmSchema.optional(),
    availableDurationMinutes: availableDurationMinutesSchema.optional(),
    style: rideStyleSchema,
    preferences: routePreferencesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const separationKm = haversineKm(
      data.start.coordinates,
      data.destination.coordinates,
    );
    if (separationKm < MIN_DESTINATION_SEPARATION_KM) {
      ctx.addIssue(
        "Le départ et la destination sont trop proches pour un trajet vers une destination (FR-002).",
      );
    }
  });

export type ParsedDestinationRideRequest = z.infer<
  typeof destinationRideRequestSchema
>;

/**
 * FR-034 — described one-way generate/regenerate. The arrival is chosen by
 * the planner (`FR-018`), so FR-002's start/destination separation does not
 * apply to a leftover previous arrival.
 */
export const describedOneWayRideRequestSchema = z.object({
  type: z.literal("destination"),
  start: placeSchema,
  destination: placeSchema.optional(),
  targetDistanceKm: targetDistanceKmSchema.optional(),
  availableDurationMinutes: availableDurationMinutesSchema.optional(),
  style: rideStyleSchema.optional(),
  preferences: routePreferencesSchema.optional(),
});

export type ParsedDescribedOneWayRideRequest = z.infer<
  typeof describedOneWayRideRequestSchema
>;

export function parseLoopRideRequest(input: unknown): LoopRideRequest {
  return loopRideRequestSchema.parse(input);
}

export function parseDestinationRideRequest(
  input: unknown,
): DestinationRideRequest {
  const parsed = destinationRideRequestSchema.parse(input);
  return {
    ...parsed,
    preferences: parsed.preferences ?? {
      avoidHighways: false,
      avoidUnpaved: false,
    },
  };
}

export const roundTripRideRequestSchema = z
  .object({
    type: z.literal("round_trip"),
    start: placeSchema,
    destination: placeSchema,
    targetDistanceKm: targetDistanceKmSchema.optional(),
    availableDurationMinutes: availableDurationMinutesSchema.optional(),
    style: rideStyleSchema,
    preferences: routePreferencesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const separationKm = haversineKm(
      data.start.coordinates,
      data.destination.coordinates,
    );
    if (separationKm < MIN_DESTINATION_SEPARATION_KM) {
      ctx.addIssue(
        "Le départ et la destination sont trop proches pour un aller-retour (FR-003).",
      );
    }
  });

export type ParsedRoundTripRideRequest = z.infer<
  typeof roundTripRideRequestSchema
>;

export function parseRoundTripRideRequest(
  input: unknown,
): RoundTripRideRequest {
  const parsed = roundTripRideRequestSchema.parse(input);
  return {
    ...parsed,
    preferences: parsed.preferences ?? {
      avoidHighways: false,
      avoidUnpaved: false,
    },
  };
}

export const gpxRideRequestSchema = z.object({
  type: z.literal("gpx"),
  start: placeSchema,
  destination: placeSchema,
  name: z.string().min(1),
  style: rideStyleSchema.optional(),
  preferences: routePreferencesSchema.optional(),
});

export type ParsedGpxRideRequest = z.infer<typeof gpxRideRequestSchema>;

export function parseGpxRideRequest(
  input: unknown,
): import("./types").GpxRideRequest {
  const parsed = gpxRideRequestSchema.parse(input);
  return {
    ...parsed,
    preferences: parsed.preferences ?? { ...DEFAULT_ROUTE_PREFERENCES },
  };
}

const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

const previousRouteSchema = z.object({
    type: z.enum(["loop", "destination", "round_trip", "gpx"]),
  geometry: lineStringSchema,
});

/** FR-012 — same request plus the previous corridor geometry. */
export const regenerateRideEnvelopeSchema = z
  .object({
    request: z.object({ type: z.unknown() }).passthrough(),
    previousRoute: previousRouteSchema,
  })
  .superRefine((data, ctx) => {
    if (data.request.type !== data.previousRoute.type) {
      ctx.addIssue(
        "Le trajet précédent doit être du même type que la demande (FR-012).",
      );
    }
    if (lineStringLengthKm(data.previousRoute.geometry) <= 0) {
      ctx.addIssue(
        "Le trajet précédent doit avoir une géométrie de longueur non nulle (FR-012).",
      );
    }
  });

export type ParsedRegenerateRideEnvelope = z.infer<
  typeof regenerateRideEnvelopeSchema
>;

const navigationStepSchema = z.object({
  id: z.string().min(1),
  maneuverType: z.enum([
    "depart",
    "arrive",
    "continue",
    "turn",
    "uturn",
    "fork",
    "merge",
    "on_ramp",
    "off_ramp",
    "end_of_road",
    "roundabout",
    "new_name",
    "unknown",
  ]),
  modifier: z.enum([
    "left",
    "right",
    "sharp_left",
    "sharp_right",
    "slight_left",
    "slight_right",
    "straight",
    "uturn",
    "unknown",
  ]),
  location: coordinatesSchema,
  bearingBeforeDeg: z.number().optional(),
  bearingAfterDeg: z.number().optional(),
  exit: z.number().int().positive().optional(),
  name: z.string().optional(),
  ref: z.string().optional(),
  destinations: z.string().optional(),
  rotaryName: z.string().optional(),
  drivingSide: z.enum(["left", "right"]).optional(),
  distanceKm: z.number().nonnegative(),
  durationMinutes: z.number().nonnegative(),
  geometry: lineStringSchema,
});

const routeSegmentSnapshotSchema = z.object({
  id: z.string().min(1),
  geometry: lineStringSchema,
  distanceKm: z.number().nonnegative(),
  durationMinutes: z.number().nonnegative(),
  roadName: z.string().optional(),
  surface: z.enum(["paved", "unpaved", "unknown"]).optional(),
  roadClass: z.string().optional(),
});

const generatedRouteSnapshotSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["loop", "destination", "round_trip", "gpx"]),
    start: placeSchema,
    destination: placeSchema.optional(),
    style: rideStyleSchema.optional(),
    targetDistanceKm: z.number().optional(),
    geometry: lineStringSchema,
    segments: z.array(routeSegmentSnapshotSchema),
    steps: z.array(navigationStepSchema).optional(),
    distanceKm: z.number().nonnegative(),
    durationMinutes: z.number().nonnegative(),
    warnings: z.array(z.string()),
    statistics: z
      .object({
        repeatedRoadPercent: z.number().optional(),
        outboundReturnOverlapPercent: z.number().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== "loop" && !data.destination) {
      ctx.addIssue(
        "Le trajet original doit inclure la destination pour un recalcul (FR-026).",
      );
    }
  });

/** FR-026 — current GPS plus the in-memory route, only when rerouting. */
export const recalculateRideEnvelopeSchema = z
  .object({
    currentPosition: coordinatesSchema,
    progressKm: z.number().nonnegative(),
    request: z.object({ type: z.unknown() }).passthrough(),
    originalRoute: generatedRouteSnapshotSchema,
  })
  .superRefine((data, ctx) => {
    if (data.request.type !== data.originalRoute.type) {
      ctx.addIssue(
        "La demande de recalcul doit être du même type que le trajet courant (FR-026).",
      );
    }
    if (lineStringLengthKm(data.originalRoute.geometry) <= 0) {
      ctx.addIssue(
        "Le trajet courant doit avoir une géométrie de longueur non nulle (FR-026).",
      );
    }
  });

export type ParsedRecalculateRideEnvelope = z.infer<
  typeof recalculateRideEnvelopeSchema
>;

export function unsupportedRideTypeMessage(type: unknown): string {
  if (type === "round_trip") {
    return "Le type de trajet « round_trip » n’est pas pris en charge par ce générateur. Utilisez le générateur FR-003.";
  }

  if (type === "destination" || type === "loop") {
    return `Le type de trajet « ${type} » n’est pas pris en charge par ce générateur.`;
  }

  return "Seuls les types « loop » (FR-001), « destination » (FR-002) et « round_trip » (FR-003) sont pris en charge.";
}
