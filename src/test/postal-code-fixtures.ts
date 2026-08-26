/**
 * FR-040 — jeu d’essai représentatif de la table `postal_codes_quebec`.
 *
 * Ces coordonnées sont des données de test approximatives. Elles n’apparaissent
 * jamais dans le code de production : celui-ci lit toujours la base de
 * référence alimentée par Données Québec.
 */

export type PostalCodeRow = {
  postal_code: string;
  latitude: number;
  longitude: number;
  municipality: string;
};

export const POSTAL_CODE_FIXTURES: PostalCodeRow[] = [
  {
    postal_code: "J2G2W4",
    latitude: 45.4008,
    longitude: -72.7331,
    municipality: "Granby",
  },
  {
    postal_code: "J0E1Z0",
    latitude: 45.4783,
    longitude: -72.6819,
    municipality: "Roxton Pond",
  },
  {
    postal_code: "J1H1A1",
    latitude: 45.4022,
    longitude: -71.8887,
    municipality: "Sherbrooke",
  },
];

/**
 * `fetch` de test qui répond comme PostgREST : égalité exacte sur la clé
 * primaire, jamais de recherche partielle.
 */
export function createPostalCodeTableFetch(
  rows: readonly PostalCodeRow[] = POSTAL_CODE_FIXTURES,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const filter = url.searchParams.get("postal_code") ?? "";
    const [operator, value] = [
      filter.slice(0, filter.indexOf(".")),
      filter.slice(filter.indexOf(".") + 1),
    ];
    if (operator !== "eq") {
      return Response.json(
        { message: "unsupported operator" },
        { status: 400 },
      );
    }
    const matches = rows.filter((row) => row.postal_code === value);
    return Response.json(matches.slice(0, 1));
  }) as typeof fetch;
}
