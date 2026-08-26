/**
 * FR-038 — Canadian postal codes (`A1A 1A1`).
 *
 * The rider may type them with or without a space and in any case. Postes
 * Canada never uses D, F, I, O, Q or U in any position, and never W or Z in
 * the first position, so those letters are rejected rather than geocoded.
 */

const FIRST_LETTERS = "ABCEGHJKLMNPRSTVXY";
const LETTERS = "ABCEGHJKLMNPRSTVWXYZ";

const POSTAL_CODE_PATTERN = new RegExp(
  `^[${FIRST_LETTERS}]\\d[${LETTERS}]\\d[${LETTERS}]\\d$`,
);

/** Forward sortation area: the first three characters (`J2G`). */
const FSA_PATTERN = new RegExp(`^[${FIRST_LETTERS}]\\d[${LETTERS}]$`);

export type CanadianPostalCode = {
  /** Display form, always `A1A 1A1`. */
  normalized: string;
  /** Forward sortation area, always three characters. */
  fsa: string;
};

function compact(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Parses a full Canadian postal code. Returns null for anything else,
 * including a bare forward sortation area — see `parseForwardSortationArea`.
 */
export function parseCanadianPostalCode(
  value: string,
): CanadianPostalCode | null {
  const compacted = compact(value);
  if (!POSTAL_CODE_PATTERN.test(compacted)) {
    return null;
  }
  return {
    normalized: `${compacted.slice(0, 3)} ${compacted.slice(3)}`,
    fsa: compacted.slice(0, 3),
  };
}

/** Parses a bare forward sortation area such as `J2G`. */
export function parseForwardSortationArea(value: string): string | null {
  const compacted = compact(value);
  return FSA_PATTERN.test(compacted) ? compacted : null;
}

/**
 * Normalizes a postal code for display. Returns the input unchanged when it is
 * not a Canadian postal code, so foreign codes are never mangled.
 */
export function formatCanadianPostalCode(value: string): string {
  return parseCanadianPostalCode(value)?.normalized ?? value.trim();
}

export function isCanadianPostalCode(value: string): boolean {
  return parseCanadianPostalCode(value) !== null;
}
