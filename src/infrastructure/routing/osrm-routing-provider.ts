import { z } from "zod";
import type { LineString, Position } from "@/domain/geo/types";
import type { RouteSegment } from "@/domain/ride/types";
import { RoutingKnowledgeError } from "./routing-knowledge-error";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "./routing-provider";

const DEFAULT_PROFILE = "driving";
export const OSRM_REQUEST_TIMEOUT_MS = 7_000;
const OSRM_USER_AGENT = "Ride/1.0 (+https://github.com/yvlar/ride)";

const positionSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(positionSchema).min(2),
});
const osrmStepSchema = z.object({
  distance: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  geometry: lineStringSchema,
  name: z.string().optional(),
  ref: z.string().optional(),
});
const osrmRouteSchema = z.object({
  distance: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  geometry: lineStringSchema,
  legs: z.array(
    z.object({
      steps: z.array(osrmStepSchema),
    }),
  ),
});
const osrmEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
});
const osrmSuccessSchema = z.object({
  code: z.literal("Ok"),
  routes: z.array(osrmRouteSchema).min(1),
});

type OsrmRoute = z.infer<typeof osrmRouteSchema>;
type OsrmStep = z.infer<typeof osrmStepSchema>;

/**
 * Real-road routing adapter backed by an OSRM HTTP service and OSM data.
 * Map tiles remain a separate display concern (BR-004 / NFR-005).
 */
export class OsrmRoutingProvider implements RoutingProvider {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly profile = DEFAULT_PROFILE,
    private readonly timeoutMs = OSRM_REQUEST_TIMEOUT_MS,
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
  }

  async calculateRoute(
    input: ProviderRouteRequest,
  ): Promise<ProviderRouteResult> {
    const url = this.buildRouteUrl(input);
    const response = await this.fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": OSRM_USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const payload = await readPayload(response);
    const envelope = osrmEnvelopeSchema.safeParse(payload);
    if (
      envelope.success &&
      (envelope.data.code === "NoRoute" || envelope.data.code === "NoSegment")
    ) {
      throw noRouteFoundError();
    }
    if (!response.ok) {
      throw new Error(`OSRM HTTP ${response.status}`);
    }
    if (!envelope.success) {
      throw new Error("Réponse OSRM invalide.");
    }
    if (envelope.data.code !== "Ok") {
      throw new Error(`OSRM a refusé la requête (${envelope.data.code}).`);
    }

    const parsed = osrmSuccessSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse OSRM incomplète.");
    }

    return toProviderResult(parsed.data.routes[0]);
  }

  private buildRouteUrl(input: ProviderRouteRequest): URL {
    const stops = [input.start, ...(input.waypoints ?? []), input.destination];
    const coordinatePath = stops.map(serializeCoordinates).join(";");
    const url = new URL(
      `route/v1/${encodeURIComponent(this.profile)}/${coordinatePath}`,
      this.baseUrl,
    );
    url.searchParams.set("steps", "true");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("overview", "full");
    url.searchParams.set("continue_straight", "false");
    if (input.preferences?.avoidHighways) {
      url.searchParams.set("exclude", "motorway");
    }
    return url;
  }
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`OSRM HTTP ${response.status}`);
    }
    throw new Error("Réponse OSRM invalide.");
  }
}

function parseBaseUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("ROUTING_API_BASE_URL doit utiliser HTTP ou HTTPS.");
  }
  return url;
}

function serializeCoordinates(point: ProviderRouteRequest["start"]): string {
  if (
    !Number.isFinite(point.longitude) ||
    !Number.isFinite(point.latitude) ||
    point.longitude < -180 ||
    point.longitude > 180 ||
    point.latitude < -90 ||
    point.latitude > 90
  ) {
    throw new Error("Coordonnées de routage invalides.");
  }
  return `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`;
}

function toProviderResult(route: OsrmRoute): ProviderRouteResult {
  const geometry: LineString = route.geometry;
  const segments = route.legs.flatMap((leg, legIndex) =>
    leg.steps.flatMap((step, stepIndex) =>
      step.distance > 0
        ? [toRouteSegment(step, legIndex, stepIndex)]
        : [],
    ),
  );

  return {
    geometry,
    segments:
      segments.length > 0
        ? segments
        : [fallbackRouteSegment(geometry, route.distance, route.duration)],
    distanceKm: route.distance / 1_000,
    durationMinutes: route.duration / 60,
  };
}

function toRouteSegment(
  step: OsrmStep,
  legIndex: number,
  stepIndex: number,
): RouteSegment {
  return {
    id: segmentId(step.geometry.coordinates, legIndex, stepIndex),
    geometry: step.geometry,
    distanceKm: step.distance / 1_000,
    durationMinutes: step.duration / 60,
    roadName: formatRoadName(step),
    surface: "unknown",
  };
}

function fallbackRouteSegment(
  geometry: LineString,
  distanceM: number,
  durationSeconds: number,
): RouteSegment {
  return {
    id: segmentId(geometry.coordinates, 0, 0),
    geometry,
    distanceKm: distanceM / 1_000,
    durationMinutes: durationSeconds / 60,
    surface: "unknown",
  };
}

function segmentId(
  coordinates: Position[],
  legIndex: number,
  stepIndex: number,
): string {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return `osrm:${legIndex}:${stepIndex}:${positionId(first)}:${positionId(last)}`;
}

function positionId(position: Position | undefined): string {
  return position
    ? `${position[0].toFixed(5)},${position[1].toFixed(5)}`
    : "unknown";
}

function formatRoadName(step: OsrmStep): string | undefined {
  const parts = [step.ref?.trim(), step.name?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return [...new Set(parts)].join(" — ") || undefined;
}

function noRouteFoundError(): RoutingKnowledgeError {
  return new RoutingKnowledgeError(
    "disconnected",
    "Le réseau routier ne permet pas de relier les points demandés (FR-021).",
    [
      "Essayez un autre point de départ ou d’autres paramètres.",
      "Relâchez les préférences d’évitement si elles sont actives.",
    ],
  );
}
