/**
 * FR-040 — un même code postal peut apparaître dans plusieurs territoires de la
 * source CP Territoires. Ride ne conserve qu’une destination principale par
 * code postal, choisie de façon déterministe.
 */

export type PostalCodeRecord = {
  /** Forme compacte `J2G2W4`. */
  postalCode: string;
  latitude: number;
  longitude: number;
  municipality: string;
  /** `PRC_REP` — pourcentage de représentation du territoire. */
  representationPercent: number | null;
  /** `NB_UNITE_AD` — nombre d’unités d’adresse. */
  addressUnits: number | null;
};

function score(value: number | null): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

/**
 * Ordre de préférence : `PRC_REP` le plus élevé, puis `NB_UNITE_AD`, puis un
 * départage stable (municipalité, latitude, longitude) afin que deux exécutions
 * du pipeline produisent le même enregistrement.
 */
function compareCandidates(a: PostalCodeRecord, b: PostalCodeRecord): number {
  const byRepresentation =
    score(b.representationPercent) - score(a.representationPercent);
  if (byRepresentation !== 0) {
    return byRepresentation;
  }

  const byUnits = score(b.addressUnits) - score(a.addressUnits);
  if (byUnits !== 0) {
    return byUnits;
  }

  if (a.municipality !== b.municipality) {
    return a.municipality < b.municipality ? -1 : 1;
  }
  if (a.latitude !== b.latitude) {
    return a.latitude - b.latitude;
  }
  return a.longitude - b.longitude;
}

/** Enregistrement principal d’un groupe, ou `null` si le groupe est vide. */
export function selectPrimaryPostalCodeRecord(
  candidates: readonly PostalCodeRecord[],
): PostalCodeRecord | null {
  return candidates.reduce<PostalCodeRecord | null>(
    (best, candidate) =>
      best === null || compareCandidates(candidate, best) < 0 ? candidate : best,
    null,
  );
}

/**
 * Un enregistrement par code postal, trié par code postal pour un import
 * reproductible.
 */
export function deduplicatePostalCodeRecords(
  records: readonly PostalCodeRecord[],
): PostalCodeRecord[] {
  const groups = new Map<string, PostalCodeRecord[]>();
  for (const record of records) {
    const group = groups.get(record.postalCode);
    if (group) {
      group.push(record);
    } else {
      groups.set(record.postalCode, [record]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([, group]) => {
      const primary = selectPrimaryPostalCodeRecord(group);
      return primary ? [primary] : [];
    });
}
