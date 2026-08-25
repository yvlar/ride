import type { RideStyle, RideType, RoutePreferences } from "@/domain/ride/types";

export type NaturalLanguageRideDraft = {
  type: RideType;
  startQuery: string | null;
  destinationQuery: string | null;
  targetDistanceKm: number | null;
  availableDurationHours: number | null;
  style: RideStyle;
  preferences: RoutePreferences;
  unsupported: string[];
};

const LOOP_PATTERN = /\bboucle\b/i;
const ROUND_TRIP_PATTERN = /\baller[-\s]?retour\b|\bretour différent\b/i;
const DESTINATION_PATTERN =
  /\bvers\s+([^,.;]+?)(?:\s*[,.]|\s+avec|\s+sans|\s*$)/i;
const FROM_PATTERN =
  /\b(?:au départ de|départ de|depuis)\s+([^,.;]+?)(?:\s*[,.]|\s+avec|\s+sans|\s*$)/i;
const DISTANCE_PATTERN = /(\d+(?:[.,]\d+)?)\s*km\b/i;
const DURATION_PATTERN = /(\d+(?:[.,]\d+)?)\s*(?:h\b|heure)/i;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function parseNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function trimPlaceQuery(value: string | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return null;
  }
  const withoutStopwords = trimmed
    .replace(/\b(une|un|le|la|les|de|du|des|au|aux)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutStopwords || trimmed;
}

/**
 * FR-034 — turn a French Canadian sentence into structured Ride criteria.
 * Never invents coordinates or geometry; place names stay search queries.
 */
export function parseNaturalLanguageRide(
  text: string,
): NaturalLanguageRideDraft {
  const raw = text.trim();
  const folded = normalize(raw);
  const unsupported: string[] = [];

  let type: RideType = "destination";
  if (LOOP_PATTERN.test(raw)) {
    type = "loop";
  } else if (ROUND_TRIP_PATTERN.test(raw)) {
    type = "round_trip";
  }

  const distanceMatch = raw.match(DISTANCE_PATTERN);
  const durationMatch = raw.match(DURATION_PATTERN);
  const fromMatch = raw.match(FROM_PATTERN);
  const towardMatch = type === "loop" ? null : raw.match(DESTINATION_PATTERN);

  let style: RideStyle = "scenic";
  if (/sinueus|courbe|curvy/.test(folded)) {
    style = "curvy";
  } else if (/equilibr|touring|fluide/.test(folded)) {
    style = "touring";
  } else if (/panoram|scenic/.test(folded)) {
    style = "scenic";
  }

  if (/\brapide\b/.test(folded)) {
    unsupported.push("Le style « rapide » n’est pas offert.");
  }
  if (/aventure|gravel|hors[-\s]?piste/.test(folded)) {
    unsupported.push("Le style « aventure » n’est pas offert.");
  }
  if (/peage/.test(folded)) {
    unsupported.push("L’évitement des péages n’est pas pris en charge.");
  }
  if (/traversier|ferry/.test(folded)) {
    unsupported.push("L’évitement des traversiers n’est pas pris en charge.");
  }

  const avoidHighways = /sans autoroute|eviter les autoroutes|pas d['’]autoroute/.test(
    folded,
  );
  const avoidUnpaved = /asphalte|pave|sans gravier|uniquement asphal/.test(folded);
  const stayInCanada = /canada seulement|rester au canada|sans etats[-\s]?unis/.test(
    folded,
  );

  return {
    type,
    startQuery: trimPlaceQuery(fromMatch?.[1]),
    destinationQuery: type === "loop" ? null : trimPlaceQuery(towardMatch?.[1]),
    targetDistanceKm: distanceMatch ? parseNumber(distanceMatch[1]!) : null,
    availableDurationHours: durationMatch
      ? parseNumber(durationMatch[1]!)
      : null,
    style,
    preferences: {
      avoidHighways,
      avoidUnpaved,
      stayInCanada,
    },
    unsupported,
  };
}
