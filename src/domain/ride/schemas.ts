import { z } from "zod";
import { haversineKm } from "@/domain/geo/distance";
import { MIN_DESTINATION_SEPARATION_KM } from "./constants";
import type { DestinationRideRequest, LoopRideRequest } from "./types";

const coordinatesSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
});

const placeSchema = z.object({
  label: z.string().min(1),
  coordinates: coordinatesSchema,
});

export const rideStyleSchema = z.enum(["curvy", "scenic", "touring"]);

export const loopRideRequestSchema = z
  .object({
    type: z.literal("loop"),
    start: placeSchema,
    targetDistanceKm: z.number().gt(0).max(2000).optional(),
    availableDurationMinutes: z.number().gt(0).max(24 * 60).optional(),
    style: rideStyleSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.targetDistanceKm === undefined &&
      data.availableDurationMinutes === undefined
    ) {
      ctx.addIssue(
        "Une boucle exige une distance cible ou une durée disponible (FR-001).",
      );
    }
  });

export type ParsedLoopRideRequest = z.infer<typeof loopRideRequestSchema>;

const routePreferencesSchema = z.object({
  avoidHighways: z.boolean(),
  avoidUnpaved: z.boolean(),
});

export const destinationRideRequestSchema = z
  .object({
    type: z.literal("destination"),
    start: placeSchema,
    destination: placeSchema,
    targetDistanceKm: z.number().gt(0).max(2000).optional(),
    availableDurationMinutes: z.number().gt(0).max(24 * 60).optional(),
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

export function unsupportedRideTypeMessage(type: unknown): string {
  if (type === "round_trip") {
    return "Le type de trajet « round_trip » n’est pas encore pris en charge. Les types loop (FR-001) et destination (FR-002) le sont.";
  }

  if (type === "destination" || type === "loop") {
    return `Le type de trajet « ${type} » n’est pas pris en charge par ce générateur.`;
  }

  return "Seuls les types « loop » (FR-001) et « destination » (FR-002) sont pris en charge.";
}
