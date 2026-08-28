import { GPX_EXPORT_MIME_TYPE } from "@/domain/gpx/constants";

export type GpxFilePayload = {
  fileName: string;
  contents: string;
};

/** FR-041 — comment le fichier a réellement quitté l'application. */
export type GpxExportOutcome = "share" | "download" | "cancelled";

export class GpxFileExportError extends Error {
  constructor(message = "Le fichier GPX n’a pas pu être créé.") {
    super(message);
    this.name = "GpxFileExportError";
  }
}

type ShareCapableNavigator = {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
};

export type GpxFileExportDeps = {
  navigator?: ShareCapableNavigator | null;
  createFile?: (payload: GpxFilePayload) => File | null;
  /** Téléchargement classique; renvoie false si l'environnement ne le permet pas. */
  download?: (payload: GpxFilePayload) => boolean;
};

/** Délai avant révocation de l'URL objet : certains navigateurs annulent un
 * téléchargement dont l'URL disparaît dans le même tick. */
export const GPX_DOWNLOAD_REVOKE_DELAY_MS = 1_000;

function defaultCreateFile(payload: GpxFilePayload): File | null {
  if (typeof File === "undefined") {
    return null;
  }
  try {
    return new File([payload.contents], payload.fileName, {
      type: GPX_EXPORT_MIME_TYPE,
    });
  } catch {
    return null;
  }
}

function defaultDownload(payload: GpxFilePayload): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return false;
  }
  if (typeof URL.createObjectURL !== "function" || typeof Blob === "undefined") {
    return false;
  }
  const blob = new Blob([payload.contents], { type: GPX_EXPORT_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.fileName;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL?.(url);
    }, GPX_DOWNLOAD_REVOKE_DELAY_MS);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * FR-041 — sortie du fichier GPX : partage natif avec fichier quand l'API Web
 * Share le supporte (iPhone, PWA), sinon téléchargement classique. L'adaptateur
 * ne connaît ni l'état de l'enregistrement ni la carte (BR-004, NFR-005).
 */
export async function exportGpxFile(
  payload: GpxFilePayload,
  deps: GpxFileExportDeps = {},
): Promise<GpxExportOutcome> {
  const nav =
    deps.navigator !== undefined
      ? deps.navigator
      : typeof navigator === "undefined"
        ? null
        : (navigator as ShareCapableNavigator);
  const createFile = deps.createFile ?? defaultCreateFile;
  const download = deps.download ?? defaultDownload;

  const file = createFile(payload);
  if (file && nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: payload.fileName });
      return "share";
    } catch (error) {
      if (isAbortError(error)) {
        return "cancelled";
      }
      // Un partage refusé par l'OS ne doit pas perdre le parcours : on retombe
      // sur le téléchargement classique.
    }
  }

  try {
    if (download(payload)) {
      return "download";
    }
  } catch {
    throw new GpxFileExportError();
  }
  throw new GpxFileExportError();
}
