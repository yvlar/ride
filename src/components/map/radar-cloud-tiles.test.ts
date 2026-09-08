import { describe, expect, it, vi } from "vitest";
import { createRadarPixelCache, radarCloudCells, radarCloudTileTemplate, resolveRadarCloudTile } from "./radar-cloud-tiles";

vi.mock("maplibre-gl", () => ({ addProtocol: vi.fn() }));

const xyz = "https://tiles.test/frame/512/{z}/{x}/{y}/2/1_1.png";
const whole = { x: 0, y: 0, size: 1 };
function request(template: string, z: number, x: number, y: number, maxZoom: number | null = 7) {
  return radarCloudTileTemplate(template, maxZoom)
    .replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}
function pixels(size = 256): ImageData {
  return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4), colorSpace: "srgb" } as ImageData;
}
function paint(image: ImageData, x: number, y: number, rgba = [20, 80, 230, 255]) {
  image.data.set(rgba, (y * image.width + x) * 4);
}
/**
 * A cloud sits in the middle of its cell whatever size it drew — to the pixel
 * its integer box allows, so an odd width may land half a pixel off centre.
 */
function expectCentredOn(
  cell: { x: number; y: number; width: number },
  centre: [number, number],
) {
  expect(cell.x + cell.width / 2).toBeLessThanOrEqual(centre[0] + 1);
  expect(cell.x + cell.width / 2).toBeGreaterThanOrEqual(centre[0] - 1);
  const middleY = cell.y + (cell.width * 38) / 42 / 2;
  expect(middleY).toBeLessThanOrEqual(centre[1] + 1);
  expect(middleY).toBeGreaterThanOrEqual(centre[1] - 1);
}

describe("radar cloud tile coordinates", () => {
  it("preserves the exact frame, colour scheme and XYZ at the provider zoom", () => {
    expect(resolveRadarCloudTile(request(xyz, 7, 38, 47))).toEqual({
      url: "https://tiles.test/frame/512/7/38/47/2/1_1.png", crop: whole, seed: "7/38/47",
    });
  });
  it("crops the correct parent quadrant without requesting unsupported zooms", () => {
    expect(resolveRadarCloudTile(request(xyz, 9, 153, 190))).toEqual({
      url: "https://tiles.test/frame/512/7/38/47/2/1_1.png",
      crop: { x: 0.25, y: 0.5, size: 0.25 },
      // The requested child, so two children of one parent draw a different sky.
      seed: "9/153/190",
    });
  });
  it("keeps street-level glyph density using a small part of the real source", () => {
    const tile = resolveRadarCloudTile(request(xyz, 17, 39201, 48401));
    expect(tile.url).toContain("/7/38/47/");
    expect(tile.crop.size).toBe(1 / 1024);
  });
  it("supports GeoMet WMS extents and retains the selected timestamp", () => {
    const template = "https://geo.weather.gc.ca/geomet?CRS=EPSG:3857&BBOX={bbox-epsg-3857}&TIME=2026-09-07T12%3A00%3A00Z";
    const tile = resolveRadarCloudTile(request(template, 1, 0, 0, 9));
    const query = new URL(tile.url).searchParams;
    const bbox = query.get("BBOX")!.split(",").map(Number);
    expect(bbox[0]).toBeCloseTo(-20037508.342789244);
    expect(bbox[1]).toBeCloseTo(0);
    expect(bbox[2]).toBeCloseTo(0);
    expect(bbox[3]).toBeCloseTo(20037508.342789244);
    expect(query.get("TIME")).toBe("2026-09-07T12:00:00Z");
  });
  it("supports uncapped providers and rejects invalid tile coordinates", () => {
    expect(resolveRadarCloudTile(request(xyz, 12, 1200, 1500, null)).crop).toEqual(whole);
    expect(() => resolveRadarCloudTile(request(xyz, 7, 128, 47))).toThrow();
    expect(() => resolveRadarCloudTile(request(xyz, 7, -1, 47))).toThrow();
    expect(() => resolveRadarCloudTile(request("file:///tmp/test", 7, 1, 1))).toThrow();
  });
});

describe("actual radar echoes to clouds", () => {
  it("leaves transparent areas empty, including coloured pixels with zero alpha", () => {
    const image = pixels();
    paint(image, 5, 5, [255, 0, 0, 0]);
    expect(radarCloudCells(image, whole)).toEqual([]);
  });
  it("finds isolated echoes between sampling points and keeps a real colour", () => {
    const image = pixels();
    paint(image, 73, 149);
    const [cell] = radarCloudCells(image, whole);
    // The echo sits in the lower-left cell, and the cloud is centred in it.
    expect(cell).toMatchObject({ color: "rgb(20, 80, 230)" });
    expectCentredOn(cell, [64, 192]);
  });
  it("covers the entire rainy tile with a bounded, evenly spaced cloud field", () => {
    const image = pixels();
    image.data.fill(255);
    const cells = radarCloudCells(image, whole);
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map(({ x, y }) => `${x},${y}`)).size).toBe(4);
    // Every stray still fits inside the tile, however big it drew.
    expect(
      cells.every(({ x, y, width }) => x >= 0 && y >= 0 && x + width <= 256 && y + width <= 256),
    ).toBe(true);
  });
  it("draws a tile's clouds at different sizes, and the same ones every time", () => {
    const image = pixels();
    image.data.fill(255);
    const widths = radarCloudCells(image, whole, "9/153/190").map((cell) => cell.width);

    // A sky, not a stamped grid — and the neighbouring tile is not a copy.
    expect(new Set(widths).size).toBeGreaterThan(1);
    expect(radarCloudCells(image, whole, "9/154/190").map((cell) => cell.width))
      .not.toEqual(widths);
    // Redrawing the same tile of the same frame gives back the same sky.
    expect(radarCloudCells(image, whole, "9/153/190").map((cell) => cell.width))
      .toEqual(widths);
  });

  it("does not move a rain cell into a neighbouring overscaled child", () => {
    const image = pixels(512);
    paint(image, 330, 20);
    expect(radarCloudCells(image, { x: 0, y: 0, size: 0.5 })).toEqual([]);
    expect(radarCloudCells(image, { x: 0.5, y: 0, size: 0.5 })).toHaveLength(1);
  });
  it("changes with the frame even when there are no forecast samples nearby", () => {
    const previous = pixels();
    const next = pixels();
    paint(previous, 5, 5);
    paint(next, 250, 250);
    expectCentredOn(radarCloudCells(previous, whole)[0], [64, 64]);
    expectCentredOn(radarCloudCells(next, whole)[0], [192, 192]);
  });
});

describe("radar source pixel cache", () => {
  it("shares parent requests, caches completed pixels and separates frames", async () => {
    const load = vi.fn(async () => pixels());
    const read = createRadarPixelCache(load);
    const signal = new AbortController().signal;
    const [first, second] = await Promise.all([read("past", signal), read("past", signal)]);
    expect(first).toBe(second);
    await read("past", signal);
    expect(load).toHaveBeenCalledTimes(1);
    await read("next", signal);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("cancels a discarded child without cancelling the parent's other consumer", async () => {
    let finish!: (value: ImageData) => void;
    let fetchSignal!: AbortSignal;
    const read = createRadarPixelCache((_url, signal) => {
      fetchSignal = signal;
      return new Promise((resolve) => { finish = resolve; });
    });
    const first = new AbortController();
    const second = new AbortController();
    const one = read("parent", first.signal);
    const two = read("parent", second.signal);
    const cancelled = expect(one).rejects.toMatchObject({ name: "AbortError" });
    first.abort();
    await cancelled;
    expect(fetchSignal.aborted).toBe(false);
    const image = pixels();
    finish(image);
    expect(await two).toBe(image);
  });
  it("aborts abandoned downloads and retries failures", async () => {
    let fetchSignal!: AbortSignal;
    const load = vi.fn((_url: string, signal: AbortSignal): Promise<ImageData> => {
      fetchSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    });
    const read = createRadarPixelCache(load);
    const controller = new AbortController();
    const result = read("parent", controller.signal);
    const cancelled = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await cancelled;
    expect(fetchSignal.aborted).toBe(true);
    load.mockResolvedValueOnce(pixels());
    await read("parent", new AbortController().signal);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("bounds memory while panning over many tiles", async () => {
    const load = vi.fn(async () => pixels(1));
    const read = createRadarPixelCache(load);
    const signal = new AbortController().signal;
    for (let i = 0; i < 17; i += 1) await read(String(i), signal);
    await read("16", signal);
    expect(load).toHaveBeenCalledTimes(17);
    await read("0", signal);
    expect(load).toHaveBeenCalledTimes(18);
  });
});
