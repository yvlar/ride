import {
  deduplicatePostalCodeRecords,
  type PostalCodeRecord,
} from "@/domain/postal-codes/deduplicate-postal-codes";
import { normalizeCanadianPostalCode } from "@/domain/postal-codes/normalize-postal-code";

/**
 * FR-040 — adaptateur de la source de synchronisation Données Québec
 * (CP Territoires). Il valide la réponse CKAN et protège la table de
 * production contre un import corrompu ou tronqué.
 *
 * Le pipeline d’import (`scripts/update-quebec-postal-codes.ts`) s’en sert;
 * l’application, elle, ne lit que Supabase.
 */

export const QUEBEC_POSTAL_CODES_RESOURCE_ID =
  "bbd5521c-120f-494b-b2a3-a6a682d8d458";
export const QUEBEC_POSTAL_CODES_SOURCE_LABEL =
  "Données Québec - CP Territoires";
export const CKAN_DATASTORE_SEARCH_URL =
  "https://www.donneesquebec.ca/recherche/api/3/action/datastore_search";
export const CKAN_RESOURCE_SHOW_URL =
  "https://www.donneesquebec.ca/recherche/api/3/action/resource_show";

/**
 * Garde-fous contre un import corrompu ou tronqué (voir docs/postal-codes.md).
 * CP Territoires couvre environ 220 000 codes postaux uniques; un import qui en
 * rapporte beaucoup moins signale une source tronquée.
 */
export const MIN_EXPECTED_POSTAL_CODES = 100_000;
export const MIN_MUNICIPALITY_RATIO = 0.9;
/** Un import ne doit jamais réduire la table de plus de la moitié. */
export const MAX_SHRINK_RATIO = 0.5;

/**
 * Boîte englobante grossière du Canada. Elle ne sert qu’à rejeter des
 * coordonnées manifestement corrompues (0,0 ou latitude et longitude
 * inversées) dans cette source. La couche métier, elle, ne suppose aucune
 * région : une autre province se branchera par une autre table.
 */
const CANADA_BOUNDS = {
  minLatitude: 41,
  maxLatitude: 84,
  minLongitude: -142,
  maxLongitude: -52,
};

export class PostalCodeImportError extends Error {}

export type CkanPage = {
  total: number;
  records: unknown[];
};

export type QuebecSourceValidation = {
  /** Enregistrements valides, avant déduplication. */
  records: PostalCodeRecord[];
  rejectedRows: number;
  rowsWithMunicipality: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Les noms de colonnes CKAN sont lus sans dépendre de leur casse. */
function fieldReader(row: Record<string, unknown>): (name: string) => unknown {
  const byLowerKey = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    byLowerKey.set(key.toLowerCase(), value);
  }
  return (name) => byLowerKey.get(name.toLowerCase());
}

export function parseSourceNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSourceText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Valide l’enveloppe CKAN `{ success, result: { total, records } }`. */
export function parseCkanPage(payload: unknown): CkanPage {
  const envelope = asRecord(payload);
  if (!envelope || envelope.success !== true) {
    throw new PostalCodeImportError(
      "Réponse CKAN invalide : le champ « success » n’est pas vrai.",
    );
  }
  const result = asRecord(envelope.result);
  const records = result?.records;
  const total = result?.total;
  if (!Array.isArray(records) || typeof total !== "number" || total < 0) {
    throw new PostalCodeImportError(
      "Réponse CKAN invalide : « result.records » ou « result.total » est absent.",
    );
  }
  return { total, records };
}

/** `last_modified` de la ressource CKAN, en ISO 8601, ou `null`. */
export function parseResourceUpdatedAt(payload: unknown): string | null {
  const result = asRecord(asRecord(payload)?.result);
  const timestamp =
    parseSourceText(result?.last_modified) || parseSourceText(result?.created);
  if (!timestamp) {
    return null;
  }
  const parsed = new Date(
    /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp) ? timestamp : `${timestamp}Z`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Retient les lignes exploitables : code postal canadien plausible et
 * coordonnées valides. Les autres sont comptées comme rejetées.
 */
export function validateQuebecPostalCodeRows(
  rows: readonly unknown[],
): QuebecSourceValidation {
  const records: PostalCodeRecord[] = [];
  let rejectedRows = 0;
  let rowsWithMunicipality = 0;

  for (const row of rows) {
    const source = asRecord(row);
    if (!source) {
      rejectedRows += 1;
      continue;
    }

    const field = fieldReader(source);
    const postalCode = normalizeCanadianPostalCode(parseSourceText(field("CP")));
    const latitude = parseSourceNumber(field("LAT"));
    const longitude = parseSourceNumber(field("LONG"));

    if (
      !postalCode ||
      latitude === null ||
      longitude === null ||
      latitude < CANADA_BOUNDS.minLatitude ||
      latitude > CANADA_BOUNDS.maxLatitude ||
      longitude < CANADA_BOUNDS.minLongitude ||
      longitude > CANADA_BOUNDS.maxLongitude
    ) {
      rejectedRows += 1;
      continue;
    }

    const municipality = parseSourceText(field("NOM_MUN"));
    if (municipality) {
      rowsWithMunicipality += 1;
    }

    records.push({
      postalCode,
      latitude,
      longitude,
      municipality,
      representationPercent: parseSourceNumber(field("PRC_REP")),
      addressUnits: parseSourceNumber(field("NB_UNITE_AD")),
    });
  }

  return { records, rejectedRows, rowsWithMunicipality };
}

/** Une destination principale par code postal, triée par code postal. */
export function primaryQuebecPostalCodes(
  validation: QuebecSourceValidation,
): PostalCodeRecord[] {
  return deduplicatePostalCodeRecords(validation.records);
}

/**
 * Refuse un import qui remplacerait les données de production par un jeu vide,
 * tronqué ou incohérent. Lève `PostalCodeImportError` le cas échéant.
 */
export function assertPostalCodeImportIsSane(input: {
  sourceRows: number;
  validation: QuebecSourceValidation;
  uniquePostalCodes: number;
  /** Nombre de lignes déjà stockées, ou `null` lorsqu’il est inconnu. */
  existingBefore: number | null;
}): void {
  const { sourceRows, validation, uniquePostalCodes, existingBefore } = input;

  if (sourceRows === 0) {
    throw new PostalCodeImportError(
      "Données Québec n’a retourné aucun enregistrement : import annulé, la table existante est conservée.",
    );
  }
  if (uniquePostalCodes === 0) {
    throw new PostalCodeImportError(
      "Aucun code postal valide après validation : import annulé.",
    );
  }
  if (uniquePostalCodes < MIN_EXPECTED_POSTAL_CODES) {
    throw new PostalCodeImportError(
      `Seulement ${uniquePostalCodes} codes postaux uniques (minimum attendu : ${MIN_EXPECTED_POSTAL_CODES}) : import annulé.`,
    );
  }

  const municipalityRatio =
    validation.records.length === 0
      ? 0
      : validation.rowsWithMunicipality / validation.records.length;
  if (municipalityRatio < MIN_MUNICIPALITY_RATIO) {
    throw new PostalCodeImportError(
      `Municipalité absente pour ${Math.round((1 - municipalityRatio) * 100)} % des lignes valides : import annulé.`,
    );
  }

  if (
    existingBefore !== null &&
    existingBefore > 0 &&
    uniquePostalCodes < existingBefore * MAX_SHRINK_RATIO
  ) {
    throw new PostalCodeImportError(
      `La source ne couvre que ${uniquePostalCodes} codes postaux contre ${existingBefore} déjà stockés : import annulé.`,
    );
  }
}
