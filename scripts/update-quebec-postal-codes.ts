/**
 * FR-040 — pipeline de mise à jour des codes postaux québécois.
 *
 *   Données Québec (CP Territoires) → validation → déduplication → Supabase
 *
 * Exécution : `npm run update:postal-codes` (ajouter `-- --dry-run` pour
 * valider la source sans écrire). Le script est idempotent : il fait un
 * `upsert` sur `postal_code` et ne supprime jamais les données existantes. Une
 * panne de la source échoue avec un code de sortie non nul et laisse la table
 * de production intacte.
 *
 * Variables d’environnement requises pour l’écriture (serveur uniquement,
 * jamais `NEXT_PUBLIC_`) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import {
  assertPostalCodeImportIsSane,
  CKAN_DATASTORE_SEARCH_URL,
  CKAN_RESOURCE_SHOW_URL,
  parseCkanPage,
  parseResourceUpdatedAt,
  PostalCodeImportError,
  primaryQuebecPostalCodes,
  QUEBEC_POSTAL_CODES_RESOURCE_ID,
  QUEBEC_POSTAL_CODES_SOURCE_LABEL,
  validateQuebecPostalCodeRows,
} from "@/infrastructure/postal-codes/quebec-source";
import { QUEBEC_POSTAL_CODES_TABLE } from "@/infrastructure/postal-codes/supabase-postal-code-provider";

const PAGE_SIZE = 5_000;
const UPSERT_BATCH_SIZE = 500;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const IMPORTS_TABLE = "postal_code_imports";

type ImportSummary = {
  sourceRows: number;
  validRows: number;
  rejectedRows: number;
  rowsWithMunicipality: number;
  uniquePostalCodes: number;
  existingBefore: number | null;
  totalAfter: number | null;
  inserted: number | null;
  upserted: number;
};

function readArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes("--dry-run") };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new PostalCodeImportError(
      `${name} est requis. Ce script s’exécute côté serveur uniquement; n’exposez jamais une clé privilégiée au navigateur.`,
    );
  }
  return value;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string | URL): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new PostalCodeImportError(
          `HTTP ${response.status} sur ${String(url)}`,
        );
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new PostalCodeImportError(`Requête échouée : ${String(url)}`);
}

/** Pagination CKAN jusqu’à `result.total`. */
async function fetchAllSourceRows(): Promise<unknown[]> {
  const rows: unknown[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const url = new URL(CKAN_DATASTORE_SEARCH_URL);
    url.searchParams.set("resource_id", QUEBEC_POSTAL_CODES_RESOURCE_ID);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const page = parseCkanPage(await fetchJson(url));
    total = page.total;

    if (page.records.length === 0) {
      break;
    }

    rows.push(...page.records);
    offset += page.records.length;
    console.log(`  … ${rows.length}/${total} enregistrements récupérés`);
  }

  if (rows.length < total) {
    throw new PostalCodeImportError(
      `Récupération incomplète : ${rows.length} enregistrements sur ${total} annoncés.`,
    );
  }

  return rows;
}

/** Date de mise à jour de la ressource, à titre informatif (jamais bloquant). */
async function fetchSourceUpdatedAt(): Promise<string | null> {
  try {
    const url = new URL(CKAN_RESOURCE_SHOW_URL);
    url.searchParams.set("id", QUEBEC_POSTAL_CODES_RESOURCE_ID);
    return parseResourceUpdatedAt(await fetchJson(url));
  } catch {
    return null;
  }
}

class SupabaseWriter {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly serviceRoleKey: string,
  ) {
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private endpoint(table: string): URL {
    return new URL(`rest/v1/${table}`, this.baseUrl);
  }

  async countRows(table: string): Promise<number | null> {
    const url = this.endpoint(table);
    url.searchParams.set("select", "postal_code");
    const response = await fetch(url, {
      method: "HEAD",
      headers: this.headers({ Prefer: "count=exact" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new PostalCodeImportError(
        `Comptage Supabase impossible : HTTP ${response.status}`,
      );
    }
    const total = response.headers.get("content-range")?.split("/")[1];
    const parsed = total ? Number(total) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }

  async upsertPostalCodes(
    rows: readonly Record<string, unknown>[],
  ): Promise<void> {
    for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
      const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
      const url = this.endpoint(QUEBEC_POSTAL_CODES_TABLE);
      url.searchParams.set("on_conflict", "postal_code");
      const response = await fetch(url, {
        method: "POST",
        headers: this.headers({
          Prefer: "resolution=merge-duplicates,return=minimal",
        }),
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new PostalCodeImportError(
          `Upsert Supabase échoué : HTTP ${response.status}${body ? ` — ${body.slice(0, 300)}` : ""}`,
        );
      }
      console.log(
        `  … ${Math.min(index + batch.length, rows.length)}/${rows.length} codes postaux écrits`,
      );
    }
  }

  async startImportLog(): Promise<string | null> {
    try {
      const response = await fetch(this.endpoint(IMPORTS_TABLE), {
        method: "POST",
        headers: this.headers({ Prefer: "return=representation" }),
        body: JSON.stringify([
          { status: "running", started_at: new Date().toISOString() },
        ]),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        return null;
      }
      const payload: unknown = await response.json();
      const first = Array.isArray(payload) ? payload[0] : null;
      const id =
        typeof first === "object" && first !== null
          ? (first as Record<string, unknown>).id
          : null;
      return typeof id === "string" ? id : null;
    } catch {
      return null;
    }
  }

  async finishImportLog(
    id: string | null,
    patch: Record<string, unknown>,
  ): Promise<void> {
    if (!id) {
      return;
    }
    try {
      const url = this.endpoint(IMPORTS_TABLE);
      url.searchParams.set("id", `eq.${id}`);
      await fetch(url, {
        method: "PATCH",
        headers: this.headers({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          ...patch,
          completed_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // La traçabilité ne doit jamais masquer le résultat de l’import.
    }
  }
}

function printSummary(summary: ImportSummary, dryRun: boolean): void {
  console.log("");
  console.log(dryRun ? "Résumé (simulation)" : "Résumé");
  console.log(`  Source rows:            ${summary.sourceRows}`);
  console.log(`  Valid rows:             ${summary.validRows}`);
  console.log(`  Rejected rows:          ${summary.rejectedRows}`);
  console.log(`  Rows with municipality: ${summary.rowsWithMunicipality}`);
  console.log(`  Unique postal codes:    ${summary.uniquePostalCodes}`);
  console.log(
    `  Existing before:        ${summary.existingBefore ?? "n/a (simulation)"}`,
  );
  console.log(`  Upserted:               ${summary.upserted}`);
  console.log(`  Inserted (new):         ${summary.inserted ?? "n/a"}`);
  console.log(`  Total after:            ${summary.totalAfter ?? "n/a"}`);
}

async function main(): Promise<void> {
  const { dryRun } = readArgs();
  const startedAt = new Date().toISOString();

  const writer = dryRun
    ? null
    : new SupabaseWriter(
        requireEnv("SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      );
  const importLogId = writer ? await writer.startImportLog() : null;

  try {
    console.log(
      `Source : ${QUEBEC_POSTAL_CODES_SOURCE_LABEL} (resource_id ${QUEBEC_POSTAL_CODES_RESOURCE_ID})`,
    );
    const rows = await fetchAllSourceRows();
    const sourceUpdatedAt = await fetchSourceUpdatedAt();

    const validation = validateQuebecPostalCodeRows(rows);
    const primary = primaryQuebecPostalCodes(validation);

    const existingBefore = writer
      ? await writer.countRows(QUEBEC_POSTAL_CODES_TABLE)
      : null;
    assertPostalCodeImportIsSane({
      sourceRows: rows.length,
      validation,
      uniquePostalCodes: primary.length,
      existingBefore,
    });

    if (writer) {
      await writer.upsertPostalCodes(
        primary.map((record) => ({
          postal_code: record.postalCode,
          latitude: record.latitude,
          longitude: record.longitude,
          municipality: record.municipality,
          prc_rep: record.representationPercent,
          address_units: record.addressUnits,
          source: QUEBEC_POSTAL_CODES_SOURCE_LABEL,
          source_resource_id: QUEBEC_POSTAL_CODES_RESOURCE_ID,
          source_updated_at: sourceUpdatedAt,
          imported_at: startedAt,
        })),
      );
    }

    const totalAfter = writer
      ? await writer.countRows(QUEBEC_POSTAL_CODES_TABLE)
      : null;
    const inserted =
      totalAfter !== null && existingBefore !== null
        ? totalAfter - existingBefore
        : null;
    const summary: ImportSummary = {
      sourceRows: rows.length,
      validRows: validation.records.length,
      rejectedRows: validation.rejectedRows,
      rowsWithMunicipality: validation.rowsWithMunicipality,
      uniquePostalCodes: primary.length,
      existingBefore,
      totalAfter,
      inserted,
      upserted: writer ? primary.length : 0,
    };

    await writer?.finishImportLog(importLogId, {
      status: "succeeded",
      source_rows: summary.sourceRows,
      postal_codes: summary.uniquePostalCodes,
      inserted,
      updated: inserted === null ? null : summary.uniquePostalCodes - inserted,
    });

    printSummary(summary, dryRun);
    console.log(dryRun ? "Simulation terminée." : "Import terminé.");
  } catch (error) {
    await writer?.finishImportLog(importLogId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(
    `Import des codes postaux échoué : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
