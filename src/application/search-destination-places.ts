import type { Place } from "@/domain/geo/types";
import { normalizeCanadianPostalCode } from "@/domain/postal-codes/normalize-postal-code";
import { postalCodePlace } from "@/domain/postal-codes/postal-code";
import type { PostalCodeProvider } from "@/domain/postal-codes/postal-code-provider";
import type { GeocodingProvider } from "@/infrastructure/geocoding/geocoding-provider";

export type SearchDestinationPlacesDependencies = {
  geocoding: GeocodingProvider;
  /** Absent lorsque la base de codes postaux n’est pas configurée. */
  postalCodes?: PostalCodeProvider | null;
  /** Journalisation serveur d’une panne de la base de référence. */
  onPostalCodeFailure?: (error: unknown) => void;
};

/**
 * FR-040 — recherche de destination : un code postal canadien complet est
 * résolu dans la base de référence, sinon la requête retombe sur le
 * fournisseur de géocodage existant (adresse, ville, POI — `FR-032`).
 *
 * Une saisie partielle (`J2G`, `J2G 2`) n’est pas un code postal plausible :
 * elle suit le chemin habituel d’autocomplétion.
 *
 * Une panne de la base de référence est journalisée côté serveur puis suivie du
 * même repli : elle ne bloque jamais la recherche de destination.
 */
export async function searchDestinationPlaces(
  query: string,
  locale: string,
  dependencies: SearchDestinationPlacesDependencies,
): Promise<Place[]> {
  const { geocoding, postalCodes, onPostalCodeFailure } = dependencies;
  const postalCode = normalizeCanadianPostalCode(query);

  if (postalCode && postalCodes) {
    try {
      const location = await postalCodes.find(postalCode);
      if (location) {
        return [postalCodePlace(location)];
      }
    } catch (error) {
      onPostalCodeFailure?.(error);
    }
  }

  return geocoding.search(query, locale);
}
