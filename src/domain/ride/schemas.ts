import { z } from "zod";
import type { LoopRideRequest } from "./types";

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

export function parseLoopRideRequest(input: unknown): LoopRideRequest {
  return loopRideRequestSchema.parse(input);
}

export function unsupportedRideTypeMessage(type: unknown): string {
  if (type === "destination" || type === "round_trip") {
    return `Le type de trajet « ${type} » n’est pas encore pris en charge. Seule la boucle (FR-001) l’est.`;
  }

  return "Seul le type de trajet « loop » (FR-001) est pris en charge.";
}
