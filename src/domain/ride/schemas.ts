import { z } from "zod";
import { haversineKm, lineStringLengthKm } from "@/domain/geo/distance";
import { MIN_DESTINATION_SEPARATION_KM } from "./constants";
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

const placeSchema = z.object({
  label: z.string().min(1),
  coordinates: coordinatesSchema,
});

export const rideStyleSchema = z.enum(["curvy", "scenic", "touring"]);

const routePreferencesSchema = z.object({
  avoidHighways: z.boolean(),
  avoidUnpaved: z.boolean(),
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

const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

const previousRouteSchema = z.object({
  type: z.enum(["loop", "destination", "round_trip"]),
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

export function unsupportedRideTypeMessage(type: unknown): string {
  if (type === "round_trip") {
    return "Le type de trajet « round_trip » n’est pas pris en charge par ce générateur. Utilisez le générateur FR-003.";
  }

  if (type === "destination" || type === "loop") {
    return `Le type de trajet « ${type} » n’est pas pris en charge par ce générateur.`;
  }

  return "Seuls les types « loop » (FR-001), « destination » (FR-002) et « round_trip » (FR-003) sont pris en charge.";
}
