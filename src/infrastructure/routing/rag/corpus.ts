import type { OffsetKm, RouteKnowledgeDocument } from "./types";

function wigglePath(
  lengthKm: number,
  samples: number,
  cycles: number,
  amplitudeKm: number,
): OffsetKm[] {
  const points: OffsetKm[] = [];
  for (let index = 0; index < samples; index += 1) {
    const t = index / (samples - 1);
    points.push({
      eastKm: t * lengthKm,
      northKm: Math.sin(t * Math.PI * cycles) * amplitudeKm,
    });
  }
  return points;
}

/**
 * In-memory motorcycle corridor knowledge. Geometry is relative (east/north km)
 * so documents can be instantiated at any request origin (NFR-005).
 */
export const MOTORCYCLE_CORRIDOR_CORPUS: RouteKnowledgeDocument[] = [
  {
    id: "ridge-cretes",
    text: "boucle moto curvy sinueux ridge crêtes secondary paved elevation",
    roadName: "Route des Crêtes",
    roadClass: "secondary",
    surface: "paved",
    relativePath: wigglePath(12, 13, 3.5, 1.8),
  },
  {
    id: "river-valley",
    text: "destination moto scenic panoramique rivière lac valley rural paved",
    roadName: "Chemin de la Vallée",
    roadClass: "secondary",
    surface: "paved",
    relativePath: wigglePath(14, 12, 1.8, 1.1),
  },
  {
    id: "lakeside",
    text: "boucle scenic panoramique lac village rural secondary paved",
    roadName: "Route du Lac",
    roadClass: "secondary",
    surface: "paved",
    relativePath: wigglePath(11, 12, 2.2, 1.4),
  },
  {
    id: "touring-ridge",
    text: "destination touring confort fluide secondary paved rolling",
    roadName: "Route de Traverse",
    roadClass: "secondary",
    surface: "paved",
    relativePath: wigglePath(16, 11, 1.2, 0.7),
  },
  {
    id: "forest-secondary",
    text: "boucle moto rural forest secondary paved curvy scenic",
    roadName: "Rang des Bois",
    roadClass: "secondary",
    surface: "paved",
    relativePath: wigglePath(10, 12, 2.8, 1.6),
  },
  {
    id: "mountain-pass",
    text: "destination curvy sinueux col mountain secondary paved elevation",
    roadName: "Col des Érables",
    roadClass: "secondary",
    surface: "paved",
    relativePath: wigglePath(13, 14, 3.2, 2.0),
  },
  {
    id: "highway-corridor",
    text: "autoroute highway touring rapide motorway paved",
    roadName: "Autoroute 10",
    roadClass: "motorway",
    surface: "paved",
    relativePath: wigglePath(20, 10, 0.4, 0.2),
  },
  {
    id: "gravel-forest",
    text: "unpaved gravel non pavé forest adventure dirt",
    roadName: "Chemin forestier",
    roadClass: "unclassified",
    surface: "unpaved",
    relativePath: wigglePath(9, 11, 2.4, 1.2),
  },
];
