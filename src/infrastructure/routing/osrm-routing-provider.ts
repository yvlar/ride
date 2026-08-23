import { z } from "zod";
import type { LineString, Position } from "@/domain/geo/types";
import type { RouteSegment } from "@/domain/ride/types";
import {
  isRoutingKnowledgeError,
  RoutingKnowledgeError,
} from "./routing-knowledge-error";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "./routing-provider";

const DEFAULT_PROFILE = "driving";
export const OSRM_REQUEST_TIMEOUT_MS = 7_000;
const OSRM_USER_AGENT = "Ride/1.0 (+https://github.com/yvlar/ride)";
const PUBLIC_OSRM_HOST = "router.project-osrm.org";
const MOTORWAY_CLASSES = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
] as const;
const MOTORWAY_NAME_PATTERNS = [
  /\b(?:autoroute|autobahn|autostrada|autopista|motorway|freeway|expressway|interstate|turnpike)\b/i,
  /\bhighway\s+4\d{2}\b/i,
  /\b(?:queen elizabeth way|qew)\b/i,
] as const;
const MOTORWAY_REF_PATTERNS = [
  /(?:^|[;\s])I[-\s]?\d+(?:$|[;\s])/i,
  /(?:^|[;\s])ON[-\s]?4\d{2}(?:$|[;\s])/i,
] as const;

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
  intersections: z
    .array(
      z.object({
        classes: z.array(z.string()).optional(),
      }),
    )
    .optional(),
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
type MotorwayExclusionSupport = "unknown" | "supported" | "unsupported";

class UnsupportedMotorwayExclusionError extends Error {}

/**
 * Real-road routing adapter backed by an OSRM HTTP service and OSM data.
 * Map tiles remain a separate display concern (BR-004 / NFR-005).
 */
export class OsrmRoutingProvider implements RoutingProvider {
  private readonly baseUrl: URL;
  private motorwayExclusionSupport: MotorwayExclusionSupport;

  constructor(
    baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly profile = DEFAULT_PROFILE,
    private readonly timeoutMs = OSRM_REQUEST_TIMEOUT_MS,
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
    // The official public demo currently rejects exclude=motorway. Avoid a
    // guaranteed 400 and let the domain select a highway-free candidate from
    // the road classes/names returned by OSRM instead.
    this.motorwayExclusionSupport =
      this.baseUrl.hostname.toLowerCase() === PUBLIC_OSRM_HOST
        ? "unsupported"
        : "unknown";
  }

  async calculateRoute(
    input: ProviderRouteRequest,
  ): Promise<ProviderRouteResult> {
    if (!input.preferences?.avoidHighways) {
      return this.requestRoute(input, false);
    }

    if (this.motorwayExclusionSupport === "unsupported") {
      return this.requestRoute(input, false);
    }
    return this.requestRouteAvoidingMotorways(input);
  }

  private async requestRoute(
    input: ProviderRouteRequest,
    excludeMotorways: boolean,
  ): Promise<ProviderRouteResult> {
    const url = this.buildRouteUrl(input, excludeMotorways);
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
      excludeMotorways &&
      envelope.success &&
      envelope.data.code === "InvalidValue"
    ) {
      throw new UnsupportedMotorwayExclusionError();
    }
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

  private async requestRouteAvoidingMotorways(
    input: ProviderRouteRequest,
  ): Promise<ProviderRouteResult> {
    try {
      const route = await this.requestRoute(input, true);
      this.motorwayExclusionSupport = "supported";
      return route;
    } catch (error) {
      if (error instanceof UnsupportedMotorwayExclusionError) {
        this.motorwayExclusionSupport = "unsupported";
        return this.requestRoute(input, false);
      }
      if (isRoutingKnowledgeError(error)) {
        // The profile accepted the exclude flag but it disconnected this
        // particular route. FR-007 allows a motorway with a warning when no
        // reasonable highway-free alternative exists, so let the domain
        // evaluate the unrestricted result.
        this.motorwayExclusionSupport = "supported";
        return this.requestRoute(input, false);
      }
      throw error;
    }
  }

  private buildRouteUrl(
    input: ProviderRouteRequest,
    excludeMotorways: boolean,
  ): URL {
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
    if (excludeMotorways) {
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
    roadClass: inferRoadClass(step),
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

function inferRoadClass(step: OsrmStep): string | undefined {
  const classes = new Set(
    step.intersections?.flatMap((intersection) =>
      (intersection.classes ?? []).map((roadClass) =>
        roadClass.trim().toLowerCase(),
      ),
    ),
  );
  const knownClass = MOTORWAY_CLASSES.find((roadClass) =>
    classes.has(roadClass),
  );
  if (knownClass) {
    return knownClass;
  }

  // Some OSRM deployments, including the public demo, omit edge classes.
  // Named motorway steps still let the provider expose useful FR-007
  // knowledge instead of treating every road class as unknown.
  const name = step.name?.trim() ?? "";
  const reference = step.ref?.trim() ?? "";
  return MOTORWAY_NAME_PATTERNS.some((pattern) => pattern.test(name)) ||
    MOTORWAY_REF_PATTERNS.some((pattern) => pattern.test(reference))
    ? "motorway"
    : undefined;
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
