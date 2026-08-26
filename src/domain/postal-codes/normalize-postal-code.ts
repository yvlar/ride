/**
 * FR-040 — normalisation et validation d’un code postal canadien.
 *
 * Le domaine ne connaît ni Supabase ni Données Québec : il ne décrit que la
 * forme d’un code postal canadien (`BR-004`, `NFR-003`).
 */

/**
 * Forme canonique de Postes Canada : `A1A1A1`.
 * Les lettres D, F, I, O, Q et U ne sont jamais utilisées; W et Z ne peuvent
 * pas ouvrir un code postal.
 */
const CANADIAN_POSTAL_CODE_PATTERN =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;

/** Espaces (y compris insécables, couverts par \s) et tirets de séparation. */
const SEPARATORS_PATTERN = /[\s-]/g;

/**
 * Retourne le code postal sans séparateur et en majuscules (`J2G2W4`), ou
 * `null` lorsque la chaîne n’est pas un code postal canadien plausible.
 *
 * Une chaîne de six caractères quelconques n’est pas un code postal.
 */
export function normalizeCanadianPostalCode(value: string): string | null {
  const compact = value.trim().toUpperCase().replace(SEPARATORS_PATTERN, "");
  return CANADIAN_POSTAL_CODE_PATTERN.test(compact) ? compact : null;
}

/** Vrai lorsque la chaîne est un code postal canadien complet et plausible. */
export function isCanadianPostalCode(value: string): boolean {
  return normalizeCanadianPostalCode(value) !== null;
}

/**
 * Forme lisible `J2G 2W4` pour l’affichage. Le stockage reste `J2G2W4`.
 */
export function formatCanadianPostalCode(value: string): string | null {
  const normalized = normalizeCanadianPostalCode(value);
  if (!normalized) {
    return null;
  }
  return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
}
