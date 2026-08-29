import { GPX_MAX_FILE_BYTES } from "./constants";
import type {
  GpxParseError,
  GpxParseResult,
  GpxPart,
  GpxPoint,
  GpxTrackKind,
  ParsedGpxTrip,
} from "./types";

const UNSAFE_XML = /<!DOCTYPE/i;
const UNSAFE_ENTITY = /<!ENTITY/i;

function error(code: GpxParseError["code"], message: string): GpxParseResult {
  return { ok: false, error: { code, message } };
}

function localName(node: Element): string {
  const raw = node.localName || node.nodeName.split(":").pop() || "";
  return raw.toLowerCase();
}

function childrenByName(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((child) => localName(child) === name);
}

function firstText(parent: Element, name: string): string | undefined {
  const child = childrenByName(parent, name)[0];
  const text = child?.textContent?.trim();
  return text ? text : undefined;
}

function parseCoordinate(value: string | null): number | null {
  if (value == null || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePoint(element: Element): GpxPoint | "out_of_bounds" | null {
  const latitude = parseCoordinate(element.getAttribute("lat"));
  const longitude = parseCoordinate(element.getAttribute("lon"));
  if (latitude == null || longitude == null) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return "out_of_bounds";
  }
  const elevationText = firstText(element, "ele");
  const elevationM =
    elevationText !== undefined ? Number(elevationText) : undefined;
  return {
    coordinates: { latitude, longitude },
    elevationM:
      elevationM !== undefined && Number.isFinite(elevationM)
        ? elevationM
        : undefined,
    time: firstText(element, "time"),
    name: firstText(element, "name"),
  };
}

function collectPoints(
  elements: Element[],
): { points: GpxPoint[]; outOfBounds: number; skipped: number } {
  const points: GpxPoint[] = [];
  let outOfBounds = 0;
  let skipped = 0;
  for (const element of elements) {
    const parsed = parsePoint(element);
    if (parsed === "out_of_bounds") {
      outOfBounds += 1;
      continue;
    }
    if (!parsed) {
      skipped += 1;
      continue;
    }
    points.push(parsed);
  }
  return { points, outOfBounds, skipped };
}

function tripFromParts(
  id: string,
  kind: GpxTrackKind,
  name: string,
  description: string | undefined,
  parts: GpxPart[],
): ParsedGpxTrip | null {
  const usable = parts.filter((part) => part.points.length >= 2);
  if (usable.length === 0) {
    return null;
  }
  return { id, kind, name, description, parts: usable };
}

function defaultName(kind: GpxTrackKind, index: number, fileName: string): string {
  const base = fileName.replace(/\.gpx$/i, "").trim() || "Trajet GPX";
  if (index === 0) {
    return base;
  }
  return kind === "track" ? `${base} · trace ${index + 1}` : `${base} · route ${index + 1}`;
}

/**
 * FR-039 — parse GPX 1.0 / 1.1 locally. External entities and oversized
 * documents are rejected before DOM construction.
 */
export function parseGpxDocument(
  xml: string,
  fileName = "trajet.gpx",
): GpxParseResult {
  if (xml.trim() === "") {
    return error("EMPTY", "Le fichier GPX est vide.");
  }
  if (xml.length > GPX_MAX_FILE_BYTES) {
    return error(
      "TOO_LARGE",
      "Le fichier GPX est trop volumineux pour être importé.",
    );
  }
  if (UNSAFE_XML.test(xml) || UNSAFE_ENTITY.test(xml)) {
    return error(
      "UNSAFE_XML",
      "Le fichier XML contient des déclarations dangereuses et a été refusé.",
    );
  }

  let document: Document;
  try {
    document = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return error("CORRUPT", "Le fichier GPX est illisible ou corrompu.");
  }

  if (document.getElementsByTagName("parsererror").length > 0) {
    return error("CORRUPT", "Le fichier GPX est illisible ou corrompu.");
  }

  const root = document.documentElement;
  if (!root || localName(root) !== "gpx") {
    return error("CORRUPT", "Le fichier n’est pas un document GPX valide.");
  }

  const metadata = childrenByName(root, "metadata")[0];
  const fileNameLabel =
    (metadata ? firstText(metadata, "name") : undefined) || firstText(root, "name");
  const fallbackName = fileNameLabel || fileName.replace(/\.gpx$/i, "") || "Trajet GPX";
  const warnings: string[] = [];
  const trips: ParsedGpxTrip[] = [];
  let waypointCount = 0;
  let outOfBounds = 0;

  waypointCount = childrenByName(root, "wpt").length;

  const tracks = childrenByName(root, "trk");
  tracks.forEach((track, index) => {
    const parts: GpxPart[] = [];
    const segments = childrenByName(track, "trkseg");
    // GPX 1.0 may place trkpt directly under trk; 1.1 uses trkseg.
    const pointGroups =
      segments.length > 0
        ? segments.map((segment) => childrenByName(segment, "trkpt"))
        : [childrenByName(track, "trkpt")];
    for (const group of pointGroups) {
      const collected = collectPoints(group);
      outOfBounds += collected.outOfBounds;
      if (collected.points.length >= 2) {
        parts.push({ points: collected.points });
      }
    }
    const trip = tripFromParts(
      `trk:${index}`,
      "track",
      firstText(track, "name") || defaultName("track", index, fallbackName),
      firstText(track, "desc"),
      parts,
    );
    if (trip) {
      trips.push(trip);
    }
  });

  const routes = childrenByName(root, "rte");
  routes.forEach((route, index) => {
    const collected = collectPoints(childrenByName(route, "rtept"));
    outOfBounds += collected.outOfBounds;
    const trip = tripFromParts(
      `rte:${index}`,
      "route",
      firstText(route, "name") || defaultName("route", index, fallbackName),
      firstText(route, "desc"),
      [{ points: collected.points }],
    );
    if (trip) {
      trips.push(trip);
    }
  });

  if (trips.length === 0) {
    if (outOfBounds > 0 && waypointCount === 0) {
      return error(
        "OUT_OF_BOUNDS",
        "Les coordonnées du fichier GPX sont hors limites.",
      );
    }
    if (waypointCount > 0) {
      return error(
        "WAYPOINTS_ONLY",
        "Ce fichier ne contient que des points de passage. Importez une trace ou une route.",
      );
    }
    return error(
      "NO_TRIP",
      "Aucun trajet exploitable n’a été trouvé dans ce fichier GPX.",
    );
  }

  if (outOfBounds > 0) {
    warnings.push(
      "Certains points hors limites ont été ignorés.",
    );
  }

  return { ok: true, trips, warnings, waypointCount };
}

export function tripNeedsRoutingSnap(trip: ParsedGpxTrip): boolean {
  return trip.kind === "route";
}
