import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules/maplibre-gl/dist");
const dest = join(root, "public");

mkdirSync(dest, { recursive: true });

copyFileSync(
  join(dist, "maplibre-gl-csp-worker.js"),
  join(dest, "maplibre-gl-worker.js"),
);
