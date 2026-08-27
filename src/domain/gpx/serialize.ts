import type { RecordedTrackPoint } from "@/domain/recording/types";
import {
  GPX_EXPORT_COORDINATE_DECIMALS,
  GPX_EXPORT_CREATOR,
  GPX_EXPORT_ELEVATION_DECIMALS,
  GPX_EXPORT_NAMESPACE,
  GPX_EXPORT_SCHEMA_LOCATION,
  GPX_EXPORT_VERSION,
} from "./constants";

const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

/** FR-041 — aucune valeur utilisateur n'entre dans le XML sans échappement. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** FR-041 — horodatage ISO 8601 en UTC, tel qu'exigé par GPX 1.1. */
export function toGpxTime(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function formatDegrees(value: number): string {
  return trimNumber(value.toFixed(GPX_EXPORT_COORDINATE_DECIMALS));
}

function formatElevation(value: number): string {
  return trimNumber(value.toFixed(GPX_EXPORT_ELEVATION_DECIMALS));
}

function trimNumber(value: string): string {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * FR-041 — nom de fichier local et lisible, du type `ride-2026-08-25-1430.gpx`.
 * L'heure est locale : c'est celle que le motocycliste reconnaît.
 */
export function recordedTrackFileName(startedAtMs: number): string {
  const date = new Date(startedAtMs);
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `ride-${stamp}.gpx`;
}

/** FR-041 — nom de trace par défaut, dérivé du même horodatage local. */
export function recordedTrackName(startedAtMs: number): string {
  const date = new Date(startedAtMs);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
  return `Parcours du ${day} à ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type RecordedTrackDocument = {
  name: string;
  points: RecordedTrackPoint[];
  /** Horodatage `<metadata><time>`; par défaut celui du premier point. */
  createdAtMs?: number;
};

/**
 * FR-041 — sérialise un parcours enregistré en GPX 1.1 (`trk`/`trkseg`/`trkpt`).
 * La sérialisation ne connaît ni le suivi GPS, ni la carte, ni le partage.
 */
export function composeRecordedTrackGpx(
  document: RecordedTrackDocument,
): string {
  const points = document.points;
  if (points.length === 0) {
    throw new Error("Un GPX exige au moins un point de trace.");
  }
  const name = escapeXml(document.name);
  const createdAt = toGpxTime(document.createdAtMs ?? points[0]!.timestamp);

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="${GPX_EXPORT_VERSION}" creator="${GPX_EXPORT_CREATOR}" xmlns="${GPX_EXPORT_NAMESPACE}" xmlns:xsi="${XSI_NAMESPACE}" xsi:schemaLocation="${GPX_EXPORT_SCHEMA_LOCATION}">`,
    "  <metadata>",
    `    <name>${name}</name>`,
    `    <time>${createdAt}</time>`,
    "  </metadata>",
    "  <trk>",
    `    <name>${name}</name>`,
    "    <trkseg>",
  ];

  for (const point of points) {
    lines.push(
      `      <trkpt lat="${formatDegrees(point.latitude)}" lon="${formatDegrees(
        point.longitude,
      )}">`,
    );
    // `<ele>` seulement quand l'appareil fournit vraiment une altitude.
    if (typeof point.altitude === "number" && Number.isFinite(point.altitude)) {
      lines.push(`        <ele>${formatElevation(point.altitude)}</ele>`);
    }
    lines.push(`        <time>${toGpxTime(point.timestamp)}</time>`);
    lines.push("      </trkpt>");
  }

  lines.push("    </trkseg>", "  </trk>", "</gpx>", "");
  return lines.join("\n");
}
