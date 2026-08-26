import type { PostalCodeLocation } from "@/domain/postal-codes/postal-code";

/**
 * FR-040 — port de lecture des codes postaux (`BR-004`, `NFR-005`).
 *
 * L’implémentation lit une base de référence (aujourd’hui Supabase, alimentée
 * par Données Québec). Le domaine et l’interface n’en dépendent pas.
 *
 * `find` reçoit une chaîne saisie par l’utilisateur; l’adaptateur la normalise.
 * Il retourne `null` lorsque le code postal est inconnu ou non plausible, et
 * lève une erreur lorsque la source est indisponible.
 */
export interface PostalCodeProvider {
  find(postalCode: string): Promise<PostalCodeLocation | null>;
}
