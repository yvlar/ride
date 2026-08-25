import { GPX_FILE_ACCEPT, GPX_MIME_TYPES } from "./constants";

export { GPX_FILE_ACCEPT };

const KNOWN_TYPES = new Set<string>(GPX_MIME_TYPES);

/**
 * FR-039 — iPhone / PWA file pickers often omit MIME types or send
 * application/octet-stream. A .gpx name is authoritative.
 */
export function isAcceptableGpxFile(file: {
  name: string;
  type?: string;
}): boolean {
  const name = file.name.trim().toLowerCase();
  if (name.endsWith(".gpx")) {
    return true;
  }
  const type = (file.type ?? "").trim().toLowerCase();
  return KNOWN_TYPES.has(type);
}

export function gpxFileInputAccept(): string {
  return GPX_FILE_ACCEPT;
}
