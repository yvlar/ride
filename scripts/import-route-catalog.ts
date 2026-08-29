/**
 * Import idempotent d'un manifeste de trajets GPX dans Supabase.
 *
 * Exemple :
 *   npm run import:route-catalog -- \
 *     --manifest data/route-catalog/quebec-2026.json \
 *     --gpx-dir ../parcours-moto-quebec-gpx
 *
 * Ajouter `--dry-run` pour valider le manifeste, les GPX, les distances et les
 * associations géographiques sans écrire. SUPABASE_SERVICE_ROLE_KEY est
 * requis uniquement pour l'écriture et ne doit jamais être exposé au client.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { z } from "zod";
import { GPX_MAX_FILE_BYTES } from "@/domain/gpx/constants";

const REQUEST_TIMEOUT_MS = 30_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSAFE_XML = /<!DOCTYPE|<!ENTITY/i;

const manifestSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  country: z.object({
    code: z.string().regex(/^[A-Z]{2}$/),
    slug: z.string().regex(SLUG),
    nameFr: z.string().min(1),
    nameEn: z.string().min(1),
    sortOrder: z.number().int(),
  }),
  subdivisions: z.array(
    z.object({
      code: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/),
      countryCode: z.string().regex(/^[A-Z]{2}$/),
      slug: z.string().regex(SLUG),
      type: z.enum(["province", "state", "territory", "district", "other"]),
      nameFr: z.string().min(1),
      nameEn: z.string().min(1),
      sortOrder: z.number().int(),
    }),
  ),
  regions: z.array(
    z.object({
      subdivisionCode: z.string().min(1),
      slug: z.string().regex(SLUG),
      nameFr: z.string().min(1),
      nameEn: z.string().min(1),
      sortOrder: z.number().int(),
    }),
  ),
  routes: z.array(
    z.object({
      slug: z.string().regex(SLUG),
      file: z.string().regex(/^[^/\\]+\.gpx$/i),
      gpxVersion: z.number().int().positive().default(1),
      nameEn: z.string().min(1).optional(),
      descriptionEn: z.string().optional(),
      primaryRegionKey: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
      regionKeys: z
        .array(z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}\/[a-z0-9]+(?:-[a-z0-9]+)*$/))
        .min(1),
      routeType: z.enum(["loop", "point_to_point"]),
      difficulty: z.enum(["easy", "moderate", "challenging"]),
      surface: z.enum(["paved", "mixed", "unpaved"]),
      distanceKm: z.number().positive(),
      durationMinutes: z.number().int().positive(),
      recommendedDays: z.object({
        min: z.number().int().min(1).max(30),
        max: z.number().int().min(1).max(30),
      }),
      season: z.object({
        startMonth: z.number().int().min(1).max(12),
        endMonth: z.number().int().min(1).max(12),
      }),
      tags: z.array(z.string().regex(SLUG)),
      sourceName: z.string().min(1),
      sourceUrl: z.string().url(),
      sourceRetrievedAt: z.iso.date(),
    }),
  ),
});

type Manifest = z.infer<typeof manifestSchema>;
type ManifestRoute = Manifest["routes"][number];
type Position = [longitude: number, latitude: number];

type ParsedGpx = {
  name: string;
  description: string;
  startLabel: string;
  endLabel: string;
  points: Position[];
  content: string;
  sizeBytes: number;
  sha256: string;
};

type PreparedRoute = {
  manifest: ManifestRoute;
  gpx: ParsedGpx;
};

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} est requis pour écrire le catalogue Supabase.`);
  }
  return value;
}

async function loadManifest(path: string): Promise<Manifest> {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Manifeste invalide : ${z.prettifyError(parsed.error)}`);
  }
  validateManifestLinks(parsed.data);
  return parsed.data;
}

function validateManifestLinks(manifest: Manifest): void {
  const subdivisions = new Set<string>();
  const subdivisionSlugs = new Set<string>();
  const regions = new Set<string>();
  const files = new Set<string>();
  const slugs = new Set<string>();
  for (const subdivision of manifest.subdivisions) {
    if (
      subdivisions.has(subdivision.code) ||
      subdivisionSlugs.has(subdivision.slug)
    ) {
      throw new Error(`Subdivision dupliquée : ${subdivision.code}.`);
    }
    subdivisions.add(subdivision.code);
    subdivisionSlugs.add(subdivision.slug);
    if (subdivision.countryCode !== manifest.country.code) {
      throw new Error(`Subdivision ${subdivision.code} rattachée au mauvais pays.`);
    }
  }
  for (const region of manifest.regions) {
    const regionKey = `${region.subdivisionCode}/${region.slug}`;
    if (regions.has(regionKey)) {
      throw new Error(`Région dupliquée : ${regionKey}.`);
    }
    regions.add(regionKey);
    if (!subdivisions.has(region.subdivisionCode)) {
      throw new Error(`Subdivision inconnue pour la région ${region.slug}.`);
    }
  }
  for (const route of manifest.routes) {
    if (files.has(route.file) || slugs.has(route.slug)) {
      throw new Error(`Trajet ou fichier dupliqué : ${route.slug}.`);
    }
    files.add(route.file);
    slugs.add(route.slug);
    if (!route.regionKeys.includes(route.primaryRegionKey)) {
      throw new Error(`La région primaire manque pour ${route.slug}.`);
    }
    if (new Set(route.regionKeys).size !== route.regionKeys.length) {
      throw new Error(`Région dupliquée pour ${route.slug}.`);
    }
    if (new Set(route.tags).size !== route.tags.length) {
      throw new Error(`Étiquette dupliquée pour ${route.slug}.`);
    }
    for (const region of route.regionKeys) {
      if (!regions.has(region)) {
        throw new Error(`Région inconnue ${region} pour ${route.slug}.`);
      }
    }
    if (route.recommendedDays.max < route.recommendedDays.min) {
      throw new Error(`Durée recommandée incohérente pour ${route.slug}.`);
    }
  }
}

async function prepareRoutes(
  manifest: Manifest,
  gpxDirectory: string,
): Promise<PreparedRoute[]> {
  const prepared: PreparedRoute[] = [];
  for (const route of manifest.routes) {
    const path = resolve(gpxDirectory, route.file);
    if (basename(path) !== route.file) {
      throw new Error(`Chemin GPX refusé : ${route.file}.`);
    }
    const content = await readFile(path, "utf8");
    const gpx = parseGpx(content, route.file);
    const measuredKm = lineDistanceKm(gpx.points);
    const toleranceKm = Math.max(2, route.distanceKm * 0.05);
    if (Math.abs(measuredKm - route.distanceKm) > toleranceKm) {
      throw new Error(
        `${route.file} : distance ${measuredKm.toFixed(1)} km, manifeste ${route.distanceKm.toFixed(1)} km.`,
      );
    }
    const closureKm = pointDistanceKm(gpx.points[0]!, gpx.points.at(-1)!);
    if (route.routeType === "loop" && closureKm > 1) {
      throw new Error(`${route.file} : boucle ouverte de ${closureKm.toFixed(1)} km.`);
    }
    prepared.push({ manifest: route, gpx });
  }
  return prepared;
}

function parseGpx(content: string, filename: string): ParsedGpx {
  const sizeBytes = Buffer.byteLength(content, "utf8");
  if (sizeBytes === 0 || sizeBytes > GPX_MAX_FILE_BYTES) {
    throw new Error(`${filename} : taille GPX invalide (${sizeBytes} octets).`);
  }
  if (UNSAFE_XML.test(content) || !/<(?:\w+:)?gpx\b/i.test(content)) {
    throw new Error(`${filename} : XML GPX invalide ou dangereux.`);
  }
  const metadata = content.match(
    /<(?:\w+:)?metadata\b[^>]*>([\s\S]*?)<\/(?:\w+:)?metadata>/i,
  )?.[1];
  const name = tagText(metadata ?? content, "name");
  const description = tagText(metadata ?? content, "desc");
  if (!name || !description) {
    throw new Error(`${filename} : nom ou description manquante.`);
  }
  const trackPoints = pointsFromTags(content, "trkpt");
  const points = trackPoints.length >= 2 ? trackPoints : pointsFromTags(content, "rtept");
  if (points.length < 2) {
    throw new Error(`${filename} : moins de deux points de trace.`);
  }
  const waypointNames = [...content.matchAll(
    /<(?:\w+:)?wpt\b[^>]*>([\s\S]*?)<\/(?:\w+:)?wpt>/gi,
  )]
    .map((match) => tagText(match[1] ?? "", "name"))
    .filter((value): value is string => Boolean(value));
  return {
    name,
    description,
    startLabel: waypointNames[0] ?? name,
    endLabel: waypointNames.at(-1) ?? name,
    points,
    content,
    sizeBytes,
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}

function pointsFromTags(content: string, tag: "trkpt" | "rtept"): Position[] {
  const points: Position[] = [];
  const expression = new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*)>`, "gi");
  for (const match of content.matchAll(expression)) {
    const attributes = match[1] ?? "";
    const latitude = Number(attribute(attributes, "lat"));
    const longitude = Number(attribute(attributes, "lon"));
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(`Coordonnée ${tag} invalide.`);
    }
    points.push([longitude, latitude]);
  }
  return points;
}

function attribute(attributes: string, name: string): string | null {
  return attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? null;
}

function tagText(content: string, name: string): string | null {
  const value = content.match(
    new RegExp(
      `<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`,
      "i",
    ),
  )?.[1];
  return value ? decodeXml(value.replace(/<[^>]+>/g, " ")).trim() || null : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function pointDistanceKm(left: Position, right: Position): number {
  const toRadians = Math.PI / 180;
  const lat1 = left[1] * toRadians;
  const lat2 = right[1] * toRadians;
  const deltaLat = (right[1] - left[1]) * toRadians;
  const deltaLon = (right[0] - left[0]) * toRadians;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function lineDistanceKm(points: Position[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += pointDistanceKm(points[index - 1]!, points[index]!);
  }
  return total;
}

function pointWkt(point: Position): string {
  return `SRID=4326;POINT(${point[0]} ${point[1]})`;
}

function lineWkt(points: Position[]): string {
  return `SRID=4326;LINESTRING(${points
    .map(([longitude, latitude]) => `${longitude} ${latitude}`)
    .join(",")})`;
}

function sqlLiteral(value: string): string {
  if (value.includes("\0")) {
    throw new Error("Une valeur SQL contient un octet nul.");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullable(value: string | undefined): string {
  return value === undefined ? "null" : sqlLiteral(value);
}

/**
 * Sortie SQL de secours pour un opérateur Supabase connecté sans accès à la
 * clé service_role. Les identifiants UUID sont toujours résolus par slug.
 */
function renderSql(manifest: Manifest, prepared: PreparedRoute): string {
  const route = prepared.manifest;
  const gpx = prepared.gpx;
  const country = manifest.country;
  const subdivisions = manifest.subdivisions.map((item) => `
insert into public.ride_route_subdivisions
  (code, country_code, slug, subdivision_type, name_fr, name_en, active, sort_order)
values (${sqlLiteral(item.code)}, ${sqlLiteral(item.countryCode)}, ${sqlLiteral(item.slug)},
  ${sqlLiteral(item.type)}, ${sqlLiteral(item.nameFr)}, ${sqlLiteral(item.nameEn)}, true, ${item.sortOrder})
on conflict (code) do update set
  country_code = excluded.country_code, slug = excluded.slug,
  subdivision_type = excluded.subdivision_type, name_fr = excluded.name_fr,
  name_en = excluded.name_en, active = true, sort_order = excluded.sort_order;`).join("\n");
  const regions = manifest.regions.map((item) => `
insert into public.ride_route_regions
  (subdivision_code, slug, name_fr, name_en, active, sort_order)
values (${sqlLiteral(item.subdivisionCode)}, ${sqlLiteral(item.slug)},
  ${sqlLiteral(item.nameFr)}, ${sqlLiteral(item.nameEn)}, true, ${item.sortOrder})
on conflict (subdivision_code, slug) do update set
  name_fr = excluded.name_fr, name_en = excluded.name_en,
  active = true, sort_order = excluded.sort_order;`).join("\n");
  const tags = `array[${route.tags.map(sqlLiteral).join(", ")}]::text[]`;
  const regionValues = route.regionKeys
    .map(
      (key, index) => {
        const [subdivisionCode, slug] = key.split("/");
        return `(${sqlLiteral(subdivisionCode!)}, ${sqlLiteral(slug!)}, ${key === route.primaryRegionKey}, ${index})`;
      },
    )
    .join(",\n    ");
  return `begin;

insert into public.ride_route_countries
  (code, slug, name_fr, name_en, active, sort_order)
values (${sqlLiteral(country.code)}, ${sqlLiteral(country.slug)},
  ${sqlLiteral(country.nameFr)}, ${sqlLiteral(country.nameEn)}, true, ${country.sortOrder})
on conflict (code) do update set
  slug = excluded.slug, name_fr = excluded.name_fr, name_en = excluded.name_en,
  active = true, sort_order = excluded.sort_order;
${subdivisions}
${regions}

insert into public.ride_routes (
  slug, status, name_fr, name_en, description_fr, description_en,
  route_type, difficulty, surface, distance_km, duration_minutes,
  recommended_days_min, recommended_days_max, season_start_month,
  season_end_month, start_label, end_label, start_point, end_point, track,
  tags, source_name, source_url, source_retrieved_at
)
values (
  ${sqlLiteral(route.slug)}, 'draft', ${sqlLiteral(gpx.name)},
  ${sqlNullable(route.nameEn)}, ${sqlLiteral(gpx.description)},
  ${sqlNullable(route.descriptionEn)}, ${sqlLiteral(route.routeType)},
  ${sqlLiteral(route.difficulty)}, ${sqlLiteral(route.surface)},
  ${route.distanceKm}, ${route.durationMinutes}, ${route.recommendedDays.min},
  ${route.recommendedDays.max}, ${route.season.startMonth},
  ${route.season.endMonth}, ${sqlLiteral(gpx.startLabel)},
  ${sqlLiteral(gpx.endLabel)}, ${sqlLiteral(pointWkt(gpx.points[0]!))},
  ${sqlLiteral(pointWkt(gpx.points.at(-1)!))}, ${sqlLiteral(lineWkt(gpx.points))},
  ${tags}, ${sqlLiteral(route.sourceName)}, ${sqlLiteral(route.sourceUrl)},
  ${sqlLiteral(route.sourceRetrievedAt)}::date
)
on conflict (slug) do update set
  status = 'draft',
  name_fr = excluded.name_fr, name_en = excluded.name_en,
  description_fr = excluded.description_fr, description_en = excluded.description_en,
  route_type = excluded.route_type, difficulty = excluded.difficulty,
  surface = excluded.surface, distance_km = excluded.distance_km,
  duration_minutes = excluded.duration_minutes,
  recommended_days_min = excluded.recommended_days_min,
  recommended_days_max = excluded.recommended_days_max,
  season_start_month = excluded.season_start_month,
  season_end_month = excluded.season_end_month,
  start_label = excluded.start_label, end_label = excluded.end_label,
  start_point = excluded.start_point, end_point = excluded.end_point,
  track = excluded.track, tags = excluded.tags, source_name = excluded.source_name,
  source_url = excluded.source_url, source_retrieved_at = excluded.source_retrieved_at;

delete from public.ride_route_region_links
where route_id = (select id from public.ride_routes where slug = ${sqlLiteral(route.slug)});

insert into public.ride_route_region_links (route_id, region_id, is_primary, sort_order)
select route_row.id, region.id, requested.is_primary, requested.sort_order
from (values
    ${regionValues}
) as requested(subdivision_code, slug, is_primary, sort_order)
join public.ride_route_regions region
  on region.subdivision_code = requested.subdivision_code
  and region.slug = requested.slug
join public.ride_route_subdivisions subdivision
  on subdivision.code = region.subdivision_code and subdivision.country_code = ${sqlLiteral(country.code)}
cross join lateral (
  select id from public.ride_routes where slug = ${sqlLiteral(route.slug)}
) route_row
on conflict (route_id, region_id) do update set
  is_primary = excluded.is_primary, sort_order = excluded.sort_order;

update public.ride_route_assets
set is_primary = false
where route_id = (select id from public.ride_routes where slug = ${sqlLiteral(route.slug)})
  and asset_type = 'gpx' and is_primary;

insert into public.ride_route_assets (
  route_id, asset_type, version, is_primary, filename, mime_type, content,
  sha256, size_bytes, point_count
)
select id, 'gpx', ${route.gpxVersion}, true, ${sqlLiteral(route.file)},
  'application/gpx+xml', ${sqlLiteral(gpx.content)}, ${sqlLiteral(gpx.sha256)},
  ${gpx.sizeBytes}, ${gpx.points.length}
from public.ride_routes where slug = ${sqlLiteral(route.slug)}
on conflict (route_id, asset_type, version) do update set
  is_primary = true, filename = excluded.filename, mime_type = excluded.mime_type,
  content = excluded.content, sha256 = excluded.sha256,
  size_bytes = excluded.size_bytes, point_count = excluded.point_count;

update public.ride_routes
set status = 'published', published_at = coalesce(published_at, statement_timestamp())
where slug = ${sqlLiteral(route.slug)};

commit;`;
}

class SupabaseWriter {
  private readonly baseUrl: URL;

  constructor(baseUrl: string, private readonly serviceRoleKey: string) {
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  }

  async upsert<T>(
    table: string,
    rows: Record<string, unknown>[],
    conflict: string,
  ): Promise<T[]> {
    const url = this.endpoint(table);
    url.searchParams.set("on_conflict", conflict);
    return this.json<T[]>(url, {
      method: "POST",
      headers: this.headers({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify(rows),
    });
  }

  async insert<T>(
    table: string,
    rows: Record<string, unknown>[],
  ): Promise<T[]> {
    return this.json<T[]>(this.endpoint(table), {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(rows),
    });
  }

  async select<T>(table: string, params: Record<string, string>): Promise<T[]> {
    const url = this.endpoint(table);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return this.json<T[]>(url, { method: "GET", headers: this.headers() });
  }

  async patch(
    table: string,
    filters: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<void> {
    const url = this.endpoint(table);
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
    await this.empty(url, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(body),
    });
  }

  async delete(
    table: string,
    filters: Record<string, string>,
  ): Promise<void> {
    const url = this.endpoint(table);
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
    await this.empty(url, {
      method: "DELETE",
      headers: this.headers({ Prefer: "return=minimal" }),
    });
  }

  private endpoint(table: string): URL {
    return new URL(`rest/v1/${table}`, this.baseUrl);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Accept: "application/json",
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private async json<T>(url: URL, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Supabase HTTP ${response.status}: ${body.slice(0, 400)}`);
    }
    return (await response.json()) as T;
  }

  private async empty(url: URL, init: RequestInit): Promise<void> {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Supabase HTTP ${response.status}: ${body.slice(0, 400)}`);
    }
  }
}

async function writeCatalog(
  writer: SupabaseWriter,
  manifest: Manifest,
  routes: PreparedRoute[],
): Promise<void> {
  await writer.upsert("ride_route_countries", [{
    code: manifest.country.code,
    slug: manifest.country.slug,
    name_fr: manifest.country.nameFr,
    name_en: manifest.country.nameEn,
    active: true,
    sort_order: manifest.country.sortOrder,
  }], "code");
  await writer.upsert(
    "ride_route_subdivisions",
    manifest.subdivisions.map((item) => ({
      code: item.code,
      country_code: item.countryCode,
      slug: item.slug,
      subdivision_type: item.type,
      name_fr: item.nameFr,
      name_en: item.nameEn,
      active: true,
      sort_order: item.sortOrder,
    })),
    "code",
  );
  const regionRows = await writer.upsert<{
    id: string;
    subdivision_code: string;
    slug: string;
  }>(
    "ride_route_regions",
    manifest.regions.map((item) => ({
      subdivision_code: item.subdivisionCode,
      slug: item.slug,
      name_fr: item.nameFr,
      name_en: item.nameEn,
      active: true,
      sort_order: item.sortOrder,
    })),
    "subdivision_code,slug",
  );
  const regionIds = new Map(
    regionRows.map((item) => [
      `${item.subdivision_code}/${item.slug}`,
      item.id,
    ]),
  );

  for (const prepared of routes) {
    const route = prepared.manifest;
    const existing = await writer.select<{
      id: string;
      published_at: string | null;
    }>("ride_routes", {
      select: "id,published_at",
      slug: `eq.${route.slug}`,
      limit: "1",
    });
    const first = prepared.gpx.points[0]!;
    const last = prepared.gpx.points.at(-1)!;
    const routeRows = await writer.upsert<{ id: string }>(
      "ride_routes",
      [{
        slug: route.slug,
        // Les appels REST sont des transactions séparées. Le trajet demeure
        // caché jusqu'à ce que ses régions et son GPX soient tous à jour.
        status: "draft",
        published_at: existing[0]?.published_at ?? null,
        name_fr: prepared.gpx.name,
        name_en: route.nameEn ?? null,
        description_fr: prepared.gpx.description,
        description_en: route.descriptionEn ?? null,
        route_type: route.routeType,
        difficulty: route.difficulty,
        surface: route.surface,
        distance_km: route.distanceKm,
        duration_minutes: route.durationMinutes,
        recommended_days_min: route.recommendedDays.min,
        recommended_days_max: route.recommendedDays.max,
        season_start_month: route.season.startMonth,
        season_end_month: route.season.endMonth,
        start_label: prepared.gpx.startLabel,
        end_label: prepared.gpx.endLabel,
        start_point: pointWkt(first),
        end_point: pointWkt(last),
        track: lineWkt(prepared.gpx.points),
        tags: route.tags,
        source_name: route.sourceName,
        source_url: route.sourceUrl,
        source_retrieved_at: route.sourceRetrievedAt,
      }],
      "slug",
    );
    const routeId = routeRows[0]?.id;
    if (!routeId) throw new Error(`Identifiant Supabase manquant pour ${route.slug}.`);

    await writer.delete(
      "ride_route_region_links",
      { route_id: `eq.${routeId}` },
    );
    await writer.upsert(
      "ride_route_region_links",
      route.regionKeys.map((key, index) => {
        const regionId = regionIds.get(key);
        if (!regionId) throw new Error(`Identifiant de région manquant : ${key}.`);
        return {
          route_id: routeId,
          region_id: regionId,
          is_primary: key === route.primaryRegionKey,
          sort_order: index,
        };
      }),
      "route_id,region_id",
    );
    await writer.patch(
      "ride_route_assets",
      { route_id: `eq.${routeId}`, asset_type: "eq.gpx", is_primary: "eq.true" },
      { is_primary: false },
    );
    await writer.upsert(
      "ride_route_assets",
      [{
        route_id: routeId,
        asset_type: "gpx",
        version: route.gpxVersion,
        is_primary: true,
        filename: route.file,
        mime_type: "application/gpx+xml",
        content: prepared.gpx.content,
        sha256: prepared.gpx.sha256,
        size_bytes: prepared.gpx.sizeBytes,
        point_count: prepared.gpx.points.length,
      }],
      "route_id,asset_type,version",
    );
    await writer.patch(
      "ride_routes",
      { id: `eq.${routeId}` },
      { status: "published", published_at: existing[0]?.published_at ?? new Date().toISOString() },
    );
    console.log(`  ✓ ${route.slug} (${prepared.gpx.points.length} points)`);
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const emitSql = process.argv.includes("--emit-sql");
  const onlySlug = option("--only");
  const manifestPath = resolve(
    option("--manifest") ?? "data/route-catalog/quebec-2026.json",
  );
  const gpxDirectory = resolve(option("--gpx-dir") ?? dirname(manifestPath));
  const manifest = await loadManifest(manifestPath);
  const allRoutes = await prepareRoutes(manifest, gpxDirectory);
  const routes = onlySlug
    ? allRoutes.filter((item) => item.manifest.slug === onlySlug)
    : allRoutes;
  if (onlySlug && routes.length !== 1) {
    throw new Error(`Trajet introuvable dans le manifeste : ${onlySlug}.`);
  }
  if (emitSql) {
    if (routes.length !== 1) {
      throw new Error("--emit-sql exige --only afin de limiter chaque transaction.");
    }
    process.stdout.write(renderSql(manifest, routes[0]!));
    return;
  }
  console.log(`Manifeste : ${manifest.name}`);
  console.log(`Trajets validés : ${routes.length}`);
  console.log(
    `GPX : ${routes.reduce((sum, item) => sum + item.gpx.sizeBytes, 0).toLocaleString("fr-CA")} octets`,
  );
  if (dryRun) {
    console.log("Simulation terminée; aucune écriture Supabase.");
    return;
  }
  const writer = new SupabaseWriter(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  let importLogId: string | null = null;
  try {
    const logs = await writer.insert<{ id: string }>("ride_route_imports", [
      { manifest_name: manifest.name, status: "running" },
    ]);
    importLogId = logs[0]?.id ?? null;
  } catch (error) {
    console.warn(
      `Journal d'import indisponible : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    await writeCatalog(writer, manifest, routes);
    if (importLogId) {
      await writer.patch(
        "ride_route_imports",
        { id: `eq.${importLogId}` },
        {
          status: "succeeded",
          completed_at: new Date().toISOString(),
          route_count: routes.length,
          asset_count: routes.length,
        },
      );
    }
  } catch (error) {
    if (importLogId) {
      await writer
        .patch(
          "ride_route_imports",
          { id: `eq.${importLogId}` },
          {
            status: "failed",
            completed_at: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          },
        )
        .catch(() => {});
    }
    throw error;
  }
  console.log(`Import terminé : ${routes.length} trajets publiés.`);
}

main().catch((error: unknown) => {
  console.error(
    `Import du catalogue échoué : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
