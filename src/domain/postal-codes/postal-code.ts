import type { Place } from "@/domain/geo/types";
import { formatCanadianPostalCode } from "@/domain/postal-codes/normalize-postal-code";

/**
 * FR-040 — destination principale associée à un code postal canadien.
 *
 * `postalCode` est toujours la forme compacte (`J2G2W4`). La région est fournie
 * par l’adaptateur : le domaine ne suppose pas que tous les codes postaux sont
 * québécois.
 */
export type PostalCodeLocation = {
  postalCode: string;
  latitude: number;
  longitude: number;
  municipality: string;
  region?: string;
};

/**
 * Convertit une localisation de code postal dans le modèle `Place` existant
 * (`FR-032`), avec un libellé lisible : « J2G 2W4, Granby, QC ».
 */
export function postalCodePlace(location: PostalCodeLocation): Place {
  const name = formatCanadianPostalCode(location.postalCode) ?? location.postalCode;
  const locality = location.municipality.trim();
  const region = location.region?.trim();
  const label = [name, locality, region]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return {
    label,
    coordinates: {
      latitude: location.latitude,
      longitude: location.longitude,
    },
    name,
    // FR-038 — the reference base resolves a full postal code to a real point,
    // so this is an exact destination, not a zone centroid.
    kind: "postal_code",
    precision: "exact",
    source: "search",
    postalCode: name,
    ...(locality ? { locality } : {}),
    ...(region ? { region } : {}),
  };
}
