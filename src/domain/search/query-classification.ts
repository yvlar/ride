import { normalizeCanadianPostalCode } from "@/domain/postal-codes/normalize-postal-code";

/**
 * FR-038 — the single place that decides what the rider typed.
 * Everything else (adapters, API route, UI) reads this classification instead
 * of re-testing the raw string.
 *
 * Postal-code shape lives in `@/domain/postal-codes` (FR-040), which is also
 * what the reference base uses; this module only decides which search path a
 * query takes.
 */

const FIRST_LETTERS = "ABCEGHJKLMNPRSTVXY";
const LETTERS = "ABCEGHJKLMNPRSTVWXYZ";

/** Forward sortation area: the first three characters (`J2G`). */
const FSA_PATTERN = new RegExp(`^[${FIRST_LETTERS}]\\d[${LETTERS}]$`);

export type DestinationQuery =
  | {
      kind: "postal_code";
      /** Display form, `A1A 1A1`, or the bare area when `areaOnly`. */
      normalized: string;
      /** Forward sortation area, used as the approximate fallback. */
      fsa: string;
      /** True when the rider typed only the three-character area. */
      areaOnly: boolean;
    }
  | { kind: "free_text"; query: string };

/** Parses a bare forward sortation area such as `J2G`. */
export function parseForwardSortationArea(value: string): string | null {
  const compacted = value.replace(/[\s-]/g, "").toUpperCase();
  return FSA_PATTERN.test(compacted) ? compacted : null;
}

export function classifyDestinationQuery(raw: string): DestinationQuery {
  const trimmed = raw.trim();

  const compact = normalizeCanadianPostalCode(trimmed);
  if (compact) {
    return {
      kind: "postal_code",
      normalized: `${compact.slice(0, 3)} ${compact.slice(3)}`,
      fsa: compact.slice(0, 3),
      areaOnly: false,
    };
  }

  const fsa = parseForwardSortationArea(trimmed);
  if (fsa) {
    return { kind: "postal_code", normalized: fsa, fsa, areaOnly: true };
  }

  return { kind: "free_text", query: trimmed };
}
