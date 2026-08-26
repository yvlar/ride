import { z } from "zod";
import { normalizeCanadianPostalCode } from "@/domain/postal-codes/normalize-postal-code";
import type { PostalCodeLocation } from "@/domain/postal-codes/postal-code";
import type { PostalCodeProvider } from "@/domain/postal-codes/postal-code-provider";

export const POSTAL_CODE_REQUEST_TIMEOUT_MS = 5_000;

/** Table alimentée par le pipeline Données Québec (voir `docs/postal-codes.md`). */
export const QUEBEC_POSTAL_CODES_TABLE = "postal_codes_quebec";

/**
 * Région couverte par la table québécoise. Elle est portée par l’adaptateur,
 * pas par le domaine : une future table canadienne fournira sa propre région.
 */
export const QUEBEC_POSTAL_CODES_REGION = "QC";

const postalCodeRowSchema = z.object({
  postal_code: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  municipality: z.string(),
});

const postalCodeRowsSchema = z.array(postalCodeRowSchema);

export type SupabasePostalCodeProviderOptions = {
  fetcher?: typeof fetch;
  table?: string;
  region?: string;
  timeoutMs?: number;
};

/**
 * FR-040 — lecture d’un code postal dans Supabase (PostgREST).
 *
 * La requête est une égalité sur la clé primaire, jamais un `LIKE`, et ne
 * télécharge jamais la table (`NFR-003`).
 */
export class SupabasePostalCodeProvider implements PostalCodeProvider {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly table: string;
  private readonly region: string;
  private readonly timeoutMs: number;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    options: SupabasePostalCodeProviderOptions = {},
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
    this.fetcher = options.fetcher ?? fetch;
    this.table = options.table ?? QUEBEC_POSTAL_CODES_TABLE;
    this.region = options.region ?? QUEBEC_POSTAL_CODES_REGION;
    this.timeoutMs = options.timeoutMs ?? POSTAL_CODE_REQUEST_TIMEOUT_MS;
  }

  async find(postalCode: string): Promise<PostalCodeLocation | null> {
    const normalized = normalizeCanadianPostalCode(postalCode);
    if (!normalized) {
      return null;
    }

    const url = new URL(`rest/v1/${this.table}`, this.baseUrl);
    url.searchParams.set(
      "select",
      "postal_code,latitude,longitude,municipality",
    );
    url.searchParams.set("postal_code", `eq.${normalized}`);
    url.searchParams.set("limit", "1");

    const response = await this.fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Recherche de code postal HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Réponse de code postal invalide.");
    }

    const parsed = postalCodeRowsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse de code postal invalide.");
    }

    const row = parsed.data[0];
    if (!row) {
      return null;
    }

    const municipality = row.municipality.trim();
    return {
      postalCode: normalizeCanadianPostalCode(row.postal_code) ?? normalized,
      latitude: row.latitude,
      longitude: row.longitude,
      municipality,
      region: this.region,
    };
  }
}

function parseBaseUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SUPABASE_URL doit utiliser HTTP ou HTTPS.");
  }
  return url;
}
