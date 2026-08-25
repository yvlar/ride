import type { Place } from "@/domain/geo/types";
import {
  composeRideRequest,
  type ComposeRideRequestResult,
} from "@/domain/ride/compose-request";
import { hoursToMinutes } from "@/domain/ride/duration";
import type { NaturalLanguageRideDraft } from "@/domain/ride/parse-natural-language";

export type ComposeDescribedRideInput = {
  draft: NaturalLanguageRideDraft;
  start: Place | null;
  destination: Place | null;
  fallbackStart: Place | null;
  searchPlaces: (query: string, signal?: AbortSignal) => Promise<Place[]>;
  signal?: AbortSignal;
};

/**
 * FR-034 — turn structured describe criteria into a validated ride request.
 * Resolves place queries via the geocoding adapter; never invents coordinates.
 */
export async function composeDescribedRide(
  input: ComposeDescribedRideInput,
): Promise<ComposeRideRequestResult> {
  const resolvedStart =
    input.start ??
    (await resolvePlace(
      input.draft.startQuery,
      input.searchPlaces,
      input.signal,
    ));

  if (!resolvedStart && input.draft.startQuery) {
    return {
      ok: false,
      errors: [
        {
          field: "start",
          message: `Lieu de départ introuvable pour « ${input.draft.startQuery} ». Précisez le nom ou utilisez Ma position.`,
        },
      ],
    };
  }

  const start = resolvedStart ?? input.fallbackStart;

  const needsDestination = input.draft.type !== "loop";
  let destination = needsDestination ? input.destination : null;
  if (needsDestination && !destination && input.draft.destinationQuery) {
    destination = await resolvePlace(
      input.draft.destinationQuery,
      input.searchPlaces,
      input.signal,
    );
    if (!destination) {
      return {
        ok: false,
        errors: [
          {
            field: "destination",
            message: `Destination introuvable pour « ${input.draft.destinationQuery} ». Précisez le nom du lieu.`,
          },
        ],
      };
    }
  }

  return composeRideRequest({
    start,
    type: input.draft.type,
    destination,
    targetDistanceKm: input.draft.targetDistanceKm,
    availableDurationMinutes:
      input.draft.availableDurationHours === null
        ? null
        : hoursToMinutes(input.draft.availableDurationHours),
    style: input.draft.style,
    preferences: input.draft.preferences,
  });
}

async function resolvePlace(
  query: string | null,
  searchPlaces: (query: string, signal?: AbortSignal) => Promise<Place[]>,
  signal?: AbortSignal,
): Promise<Place | null> {
  const trimmed = query?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const places = await searchPlaces(trimmed, signal);
    return places[0] ?? null;
  } catch {
    return null;
  }
}
