import {
  parseCanadianPostalCode,
  parseForwardSortationArea,
} from "@/domain/geo/postal-code";

/**
 * FR-038 — the single place that decides what the rider typed.
 * Everything else (adapters, API route, UI) reads this classification instead
 * of re-testing the raw string.
 */
export type DestinationQuery =
  | {
      kind: "postal_code";
      /** Display form, `A1A 1A1`. */
      normalized: string;
      /** Forward sortation area, used as the approximate fallback. */
      fsa: string;
      /** True when the rider typed only the three-character area. */
      areaOnly: boolean;
    }
  | { kind: "free_text"; query: string };

export function classifyDestinationQuery(raw: string): DestinationQuery {
  const trimmed = raw.trim();

  const postalCode = parseCanadianPostalCode(trimmed);
  if (postalCode) {
    return {
      kind: "postal_code",
      normalized: postalCode.normalized,
      fsa: postalCode.fsa,
      areaOnly: false,
    };
  }

  const fsa = parseForwardSortationArea(trimmed);
  if (fsa) {
    return { kind: "postal_code", normalized: fsa, fsa, areaOnly: true };
  }

  return { kind: "free_text", query: trimmed };
}
