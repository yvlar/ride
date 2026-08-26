const CANADIAN_POSTAL_CODE =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ]\s?\d[ABCEGHJ-NPRSTVWXYZ]\d$/i;

/** Returns the canonical A1A 1A1 form, or null when the whole value is not a Canadian postal code. */
export function normalizeCanadianPostalCode(value: string): string | null {
  const compact = value.replace(/\s/g, "").toUpperCase();
  if (!CANADIAN_POSTAL_CODE.test(compact)) {
    return null;
  }
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

export function normalizeGeocodingQuery(value: string): string {
  const trimmed = value.trim();
  return normalizeCanadianPostalCode(trimmed) ?? trimmed;
}
