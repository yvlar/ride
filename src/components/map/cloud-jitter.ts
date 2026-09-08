/**
 * FR-043 — a sky of identical clouds, evenly spaced, reads as wallpaper. Each
 * cloud strays a little from the base size, and the radar ones from the spot
 * their sampling cell would have put them on, so the layer looks like weather
 * rather than a grid.
 *
 * The stray is *derived*, never drawn: the same cloud gets the same size and
 * the same place on every render, so a zoom, a theme swap (FR-045) or a
 * weather refresh redraws the same sky instead of reshuffling it under the
 * rider. `Math.random` would make the clouds crawl on every repaint, which the
 * theme forbids as much as any other permanent animation.
 */

/**
 * How far a cloud may stray from its base size, either way.
 *
 * Deliberately under half of what one absorbed cloud adds to a fusion
 * (`SCALE_PER_ABSORBED_CLOUD`): the variation must never make a lone cloud
 * look bigger than a merged one, because that size difference is the second
 * reading of a count the accessible name already gives in words (NFR-001).
 */
export const MAX_CLOUD_SIZE_JITTER = 0.12;

/** The offset a given cloud always gets, within ±`amplitude`. */
export function cloudJitter(
  seed: string,
  amplitude: number = MAX_CLOUD_SIZE_JITTER,
): number {
  return (unitInterval(seed) * 2 - 1) * amplitude;
}

/**
 * djb2, folded into [0, 1).
 *
 * The digest goes through an avalanche pass before the fold: djb2 alone keeps
 * its top bits nearly still across short, similar strings, and it is the top
 * bits the fold reads — `cloud-0` … `cloud-11` would have come back as two
 * sizes instead of twelve, which is the grid this exists to break.
 */
function unitInterval(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (((hash << 5) + hash) ^ seed.charCodeAt(index)) >>> 0;
  }
  hash = (hash ^ (hash >>> 16)) >>> 0;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash = (hash ^ (hash >>> 15)) >>> 0;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash / 2 ** 32;
}
