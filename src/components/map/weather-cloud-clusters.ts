import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { precipitationLevelLabel } from "@/domain/weather/precipitation";
import { PRECIPITATION_LEVELS } from "@/domain/weather/types";
import type { PrecipitationLevel } from "@/domain/weather/types";
import type { WeatherCloudMarker } from "./weather-overlay";

/**
 * FR-043 — one cloud actually drawn on the map. It stands for one sampled
 * point, or for every point whose cloud would have overlapped it at the
 * current zoom: rather than a pile of faces hiding one another, the map shows
 * a single, bigger cloud.
 */
export type WeatherCloudCluster = WeatherCloudMarker & {
  /** How many sampled points this cloud stands for. 1 = an untouched sample. */
  count: number;
  /** Multiplier on the drawn size, so a merged cloud reads as the bigger one. */
  scale: number;
};

/** Drawn width of one cloud, in CSS pixels — mirrors `.ride-map-cloud-icon`. */
export const CLOUD_MARKER_WIDTH_PX = 76;

/**
 * Half the drawn width: two clouds touch once their centres are closer than
 * the sum of their footprints. The face is drawn edge to edge in its box, so
 * the box is the footprint.
 */
const CLOUD_FOOTPRINT_RADIUS_PX = CLOUD_MARKER_WIDTH_PX / 2;

/**
 * How much bigger each absorbed cloud makes the survivor, and how far that can
 * go. Without the cap a regional view would grow one cloud until it covered
 * the province; with it, a merged cloud is plainly bigger than a lone one and
 * still fits on the screen.
 */
const SCALE_PER_ABSORBED_CLOUD = 0.25;
export const MAX_CLOUD_SCALE = 1.8;

/** Web Mercator equator, in metres. */
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** MapLibre counts zoom in 512 px tiles: the world is 512 × 2^zoom px wide. */
const MAPLIBRE_TILE_SIZE_PX = 512;

export function cloudScale(count: number): number {
  return Math.min(
    MAX_CLOUD_SCALE,
    1 + Math.max(0, count - 1) * SCALE_PER_ABSORBED_CLOUD,
  );
}

/** Ground covered by one screen pixel, which is what decides an overlap. */
export function metersPerPixel(latitude: number, zoom: number): number {
  const cosLatitude = Math.cos((latitude * Math.PI) / 180);
  return (
    (EARTH_CIRCUMFERENCE_M * Math.abs(cosLatitude)) /
    (MAPLIBRE_TILE_SIZE_PX * 2 ** zoom)
  );
}

type WorkingCluster = {
  members: WeatherCloudMarker[];
  coordinates: Coordinates;
  level: PrecipitationLevel;
  probability: number;
};

/**
 * FR-043 — fuse the clouds that would overlap at `zoom` into single, larger
 * ones. Merging is repeated until nothing overlaps any more: a cloud that grew
 * by swallowing its neighbour covers more ground and may well reach a third.
 *
 * A merged cloud never softens the sky — it wears the worst level and the
 * highest risk of the points it stands for, because that is the one a rider
 * has to plan around. With no zoom to measure against (a map that cannot
 * report one), every cloud is left exactly where it was.
 *
 * The overlap is measured on the flat Mercator scale rather than through the
 * camera: a leaning exploration view (FR-046) stretches the far half of the
 * screen a little, which shifts a borderline pair by a fraction of a cloud —
 * far less than what a wrong fusion would cost in a projection round trip per
 * pair, per merge.
 */
export function mergeOverlappingClouds(
  clouds: readonly WeatherCloudMarker[],
  zoom: number | null,
): WeatherCloudCluster[] {
  if (zoom === null || !Number.isFinite(zoom)) {
    return clouds.map(toSingleCluster);
  }

  const clusters: WorkingCluster[] = clouds.map((cloud) => ({
    members: [cloud],
    coordinates: cloud.coordinates,
    level: cloud.level,
    probability: cloud.probability,
  }));

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length && !merged; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        if (!overlaps(clusters[i], clusters[j], zoom)) {
          continue;
        }
        clusters[i] = mergeClusters(clusters[i], clusters[j]);
        clusters.splice(j, 1);
        merged = true;
        break;
      }
    }
  }

  return clusters.map(toCluster);
}

function overlaps(
  first: WorkingCluster,
  second: WorkingCluster,
  zoom: number,
): boolean {
  const reach = footprintKm(first, zoom) + footprintKm(second, zoom);
  return haversineKm(first.coordinates, second.coordinates) < reach;
}

/** How far a cloud reaches on the ground, from its centre to its edge. */
function footprintKm(cluster: WorkingCluster, zoom: number): number {
  const radiusPx =
    CLOUD_FOOTPRINT_RADIUS_PX * cloudScale(cluster.members.length);
  return (radiusPx * metersPerPixel(cluster.coordinates.latitude, zoom)) / 1000;
}

function mergeClusters(
  first: WorkingCluster,
  second: WorkingCluster,
): WorkingCluster {
  const members = [...first.members, ...second.members];
  return {
    members,
    coordinates: centroid(members),
    level: worstLevel(first.level, second.level),
    probability: Math.max(first.probability, second.probability),
  };
}

/**
 * The middle of the points the cloud stands for, so the drawing sits over the
 * ground it describes rather than drifting towards whichever cloud merged
 * first.
 */
function centroid(members: readonly WeatherCloudMarker[]): Coordinates {
  let latitude = 0;
  let longitude = 0;
  for (const member of members) {
    latitude += member.coordinates.latitude;
    longitude += member.coordinates.longitude;
  }
  return {
    latitude: latitude / members.length,
    longitude: longitude / members.length,
  };
}

function worstLevel(
  first: PrecipitationLevel,
  second: PrecipitationLevel,
): PrecipitationLevel {
  // PRECIPITATION_LEVELS is ordered driest to worst, so the later one wins.
  const worse =
    PRECIPITATION_LEVELS.indexOf(second) > PRECIPITATION_LEVELS.indexOf(first);
  return worse ? second : first;
}

function toSingleCluster(cloud: WeatherCloudMarker): WeatherCloudCluster {
  return { ...cloud, count: 1, scale: 1 };
}

function toCluster(cluster: WorkingCluster): WeatherCloudCluster {
  const count = cluster.members.length;
  if (count === 1) {
    return toSingleCluster(cluster.members[0]);
  }
  return {
    // Every member's id, so the same fusion keeps the same identity between
    // renders however the samples were ordered.
    id: cluster.members
      .map((member) => member.id)
      .sort()
      .join("+"),
    coordinates: cluster.coordinates,
    level: cluster.level,
    probability: cluster.probability,
    label: `${precipitationLevelLabel(cluster.level)}, ${cluster.probability} % de risque de pluie, ${count} zones regroupées`,
    count,
    scale: cloudScale(count),
  };
}
