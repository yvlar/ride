"use client";

import { RideMap } from "@/components/map/ride-map";
import type { GeneratedLoopRoute } from "@/domain/ride/types";

const FIXTURE_LOOP: GeneratedLoopRoute = {
  id: "debug-loop-1",
  type: "loop",
  start: {
    label: "Granby, QC",
    coordinates: { latitude: 45.4001, longitude: -72.7342 },
  },
  targetDistanceKm: 80,
  style: "curvy",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
      [-72.65, 45.42],
      [-72.7342, 45.4001],
    ],
  },
  segments: [],
  distanceKm: 80,
  durationMinutes: 70,
  statistics: { repeatedRoadPercent: 4 },
  warnings: [],
};

export default function DebugMapWorkerPage() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Debug MapLibre worker URL</h1>
      <p className="text-sm text-muted-foreground">
        Temporary investigation page. Mounts RideMap with a fixture loop.
      </p>
      <RideMap route={FIXTURE_LOOP} />
    </main>
  );
}
