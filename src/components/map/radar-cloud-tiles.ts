import { addProtocol } from "maplibre-gl";
import { cloudSizeJitter } from "./cloud-size-jitter";
import { drawRadarCloud } from "./weather-markers";

export const RADAR_CLOUD_PROTOCOL = "ride-radar-clouds";
export const RADAR_CLOUD_MAX_ZOOM = 22;
const TILE_SIZE = 256;
/*
 * One cloud per cell, twice the former box so the faces read from further
 * away. Fewer, bigger clouds per tile — the cell still inspects every source
 * pixel it covers, so an isolated echo is never lost to the coarser grid.
 */
const CELL_SIZE = 128;
/** Base drawn width of a radar cloud, before its cell's own stray. */
const CLOUD_WIDTH = 96;
/** The silhouette is drawn in a 42 × 38 box (see ARCADE_VIEW_BOX). */
const CLOUD_ASPECT = 38 / 42;
const MERCATOR_HALF_WORLD = Math.PI * 6378137;
const CACHE_LIMIT = 16;

type Tile = { z: number; x: number; y: number };
type Crop = { x: number; y: number; size: number };
type Pixels = Pick<ImageData, "data" | "width" | "height">;
type RadarCloudCell = { x: number; y: number; width: number; color: string };

/** Keep the provider template encoded until our protocol resolves the tile. */
export function radarCloudTileTemplate(
  template: string,
  maxZoom: number | null,
): string {
  return `${RADAR_CLOUD_PROTOCOL}://{z}/{x}/{y}?maxzoom=${maxZoom ?? RADAR_CLOUD_MAX_ZOOM}&source=${encodeURIComponent(template)}`;
}

/**
 * Above a provider's ceiling, crop the appropriate part of its parent tile.
 * MapLibre can still request its native zoom: glyphs keep their screen size
 * instead of becoming enormous when navigating at street level.
 */
export function resolveRadarCloudTile(
  url: string,
): { url: string; crop: Crop; seed: string } {
  const parsed = new URL(url);
  const [x, y] = parsed.pathname.slice(1).split("/").map(Number);
  const tile: Tile = { z: Number(parsed.hostname), x, y };
  const maxZoom = Number(parsed.searchParams.get("maxzoom"));
  const template = parsed.searchParams.get("source");
  if (
    !template ||
    ![tile.z, x, y, maxZoom].every(Number.isInteger) ||
    tile.z < 0 || tile.z > RADAR_CLOUD_MAX_ZOOM || maxZoom < 0 ||
    x < 0 || y < 0 || x >= 2 ** tile.z || y >= 2 ** tile.z
  ) {
    throw new Error("Tuile radar invalide.");
  }
  const z = Math.min(tile.z, maxZoom);
  const scale = 2 ** (tile.z - z);
  const parent = { z, x: Math.floor(x / scale), y: Math.floor(y / scale) };
  const span = (2 * MERCATOR_HALF_WORLD) / 2 ** z;
  const bbox = [
    -MERCATOR_HALF_WORLD + parent.x * span,
    MERCATOR_HALF_WORLD - (parent.y + 1) * span,
    -MERCATOR_HALF_WORLD + (parent.x + 1) * span,
    MERCATOR_HALF_WORLD - parent.y * span,
  ].join(",");
  const resolved = template
    .replaceAll("{z}", String(z))
    .replaceAll("{x}", String(parent.x))
    .replaceAll("{y}", String(parent.y))
    .replaceAll("{bbox-epsg-3857}", bbox);
  if (!["http:", "https:"].includes(new URL(resolved).protocol)) {
    throw new Error("URL radar invalide.");
  }
  return {
    url: resolved,
    crop: { x: (x % scale) / scale, y: (y % scale) / scale, size: 1 / scale },
    // The requested tile, not its parent: neighbours must not draw the same
    // handful of sizes over and over, which would read as a pattern.
    seed: `${tile.z}/${x}/${y}`,
  };
}

/**
 * Inspect every source pixel within each display cell, including tiny isolated
 * echoes that nearest-neighbour downsampling would miss. Transparent cells
 * stay empty. Keep a real pixel colour (the most opaque echo), without guessing
 * a provider-specific dBZ scale or mixing colours into an invented severity.
 *
 * No two neighbours are drawn at quite the same size: each cell strays from
 * the base width by an amount `seed` fixes for good, so the same frame of the
 * same tile always comes back identical. Every stray still fits its cell, so a
 * bigger cloud never spills onto the one next to it.
 */
export function radarCloudCells(
  pixels: Pixels,
  crop: Crop,
  seed = "",
): RadarCloudCell[] {
  const cells: RadarCloudCell[] = [];
  const across = TILE_SIZE / CELL_SIZE;
  for (let row = 0; row < across; row += 1) {
    for (let col = 0; col < across; col += 1) {
      const left = Math.floor((crop.x + (col / across) * crop.size) * pixels.width);
      const right = Math.min(
        pixels.width,
        Math.ceil((crop.x + ((col + 1) / across) * crop.size) * pixels.width),
      );
      const top = Math.floor((crop.y + (row / across) * crop.size) * pixels.height);
      const bottom = Math.min(
        pixels.height,
        Math.ceil((crop.y + ((row + 1) / across) * crop.size) * pixels.height),
      );
      let strongest = -1;
      let alpha = 8;
      for (let py = top; py < bottom; py += 1) {
        for (let px = left; px < right; px += 1) {
          const offset = (py * pixels.width + px) * 4;
          if (pixels.data[offset + 3] > alpha) {
            alpha = pixels.data[offset + 3];
            strongest = offset;
          }
        }
      }
      if (strongest >= 0) {
        const [r, g, b] = pixels.data.slice(strongest, strongest + 3);
        const width = Math.round(
          CLOUD_WIDTH * (1 + cloudSizeJitter(`${seed}:${col},${row}`)),
        );
        cells.push({
          // Centred in its cell, so a cloud that drew big grows on both sides.
          x: Math.round(col * CELL_SIZE + (CELL_SIZE - width) / 2),
          y: Math.round(row * CELL_SIZE + (CELL_SIZE - width * CLOUD_ASPECT) / 2),
          width,
          color: `rgb(${r}, ${g}, ${b})`,
        });
      }
    }
  }
  return cells;
}

function canvasContext(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Le rendu des nuages radar est indisponible.");
  }
  return context;
}

async function fetchPixels(url: string, signal: AbortSignal): Promise<ImageData> {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error(`Radar HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    signal.throwIfAborted();
    const context = canvasContext(bitmap.width);
    context.canvas.height = bitmap.height;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Share a parent download across its visible children, with bounded memory. */
export function createRadarPixelCache(load = fetchPixels) {
  const ready = new Map<string, ImageData>();
  const pending = new Map<string, {
    controller: AbortController;
    promise: Promise<ImageData>;
    users: number;
  }>();
  return async (url: string, signal: AbortSignal): Promise<ImageData> => {
    signal.throwIfAborted();
    const cached = ready.get(url);
    if (cached) {
      ready.delete(url);
      ready.set(url, cached);
      return cached;
    }
    let entry = pending.get(url);
    if (!entry) {
      const controller = new AbortController();
      const promise = load(
        url,
        AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      )
        .then((pixels) => {
          controller.signal.throwIfAborted();
          ready.set(url, pixels);
          if (ready.size > CACHE_LIMIT) ready.delete(ready.keys().next().value!);
          return pixels;
        })
        .finally(() => {
          if (pending.get(url) === request) pending.delete(url);
        });
      const request = { controller, users: 0, promise };
      pending.set(url, request);
      entry = request;
    }
    const request = entry;
    request.users += 1;
    try {
      return await new Promise<ImageData>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        request.promise.then(resolve, reject).finally(() => {
          signal.removeEventListener("abort", abort);
        });
      });
    } finally {
      request.users -= 1;
      if (request.users === 0 && pending.get(url) === request) {
        pending.delete(url);
        request.controller.abort();
      }
    }
  };
}

let registered = false;

/** MapLibre owns viewport loading, frame changes, request cancellation and teardown. */
export function ensureRadarCloudProtocol(): void {
  if (registered) return;
  const readPixels = createRadarPixelCache();
  addProtocol(RADAR_CLOUD_PROTOCOL, async (request, controller) => {
    const { url, crop, seed } = resolveRadarCloudTile(request.url);
    const pixels = await readPixels(url, controller.signal);
    controller.signal.throwIfAborted();
    // 2x artwork stays sharp on iPhone; the logical tile size remains 256.
    const context = canvasContext(TILE_SIZE * 2);
    context.scale(2, 2);
    for (const cell of radarCloudCells(pixels, crop, seed)) {
      drawRadarCloud(context, cell.color, cell.x, cell.y, cell.width);
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      context.canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Tuile nuage indisponible."));
      }, "image/png");
    });
    controller.signal.throwIfAborted();
    return { data: await blob.arrayBuffer() };
  });
  registered = true;
}
