export const ROUTE_CATALOG_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ROUTE_CATALOG_COUNTRY_CODE = /^[A-Z]{2}$/;
export const ROUTE_CATALOG_SUBDIVISION_CODE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

export function routeCatalogRequestId(): string {
  return crypto.randomUUID();
}
export function routeCatalogJson(
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, { status });
}

export function routeCatalogError(
  code: string,
  message: string,
  status: number,
  requestId: string,
): Response {
  return routeCatalogJson(
    { error: { code, message }, meta: { requestId } },
    status,
  );
}

export function parseOptionalInteger(
  value: string | null,
  min: number,
  max: number,
): number | null | "invalid" {
  if (value === null || value === "") {
    return null;
  }
  if (!/^\d+$/.test(value)) {
    return "invalid";
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : "invalid";
}

export function safeDownloadFilename(value: string): string {
  const sanitized = value.replace(/[\r\n"\\/]/g, "-").trim();
  return sanitized || "trajet-ride.gpx";
}
