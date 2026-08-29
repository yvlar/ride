import {
  clampProbability,
  formatRainProbability,
  rainLevel,
  rainLevelDrops,
  rainSampleLabel,
  type RainLevel,
} from "@/domain/weather/rain-outlook";
import type { WeatherSample } from "@/domain/weather/types";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Lucide « cloud », dessiné dans une boîte de 24 × 26 pour loger les gouttes. */
const CLOUD_PATH = "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z";

/** Positions des gouttes, de la plus centrale à la plus extérieure. */
const DROP_X = [12, 8, 16] as const;

export function weatherCloudClassName(level: RainLevel): string {
  return `ride-map-cloud ride-map-cloud--${level}`;
}

/**
 * FR-043 — un nuage par relevé : plus la pluie est probable, plus il est
 * sombre et plus il pleut dessous. Le pourcentage reste écrit à côté pour ne
 * jamais dépendre de la couleur seule (FR-037), et le libellé accessible dit
 * la même chose en toutes lettres.
 */
export function createWeatherCloudElement(sample: WeatherSample): HTMLElement {
  const probability = clampProbability(sample.precipitationProbability);
  const level = rainLevel(probability);

  const element = document.createElement("div");
  element.className = weatherCloudClassName(level);
  element.dataset.rainLevel = level;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", rainSampleLabel(probability));

  element.append(createCloudIcon(level));

  const value = document.createElement("span");
  value.className = "ride-map-cloud-value";
  value.setAttribute("aria-hidden", "true");
  value.textContent = formatRainProbability(probability);
  element.append(value);

  return element;
}

function createCloudIcon(level: RainLevel): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 26");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ride-map-cloud-icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const cloud = document.createElementNS(SVG_NS, "path");
  cloud.setAttribute("d", CLOUD_PATH);
  cloud.classList.add("ride-map-cloud-body");
  svg.append(cloud);

  for (let index = 0; index < rainLevelDrops(level); index += 1) {
    const drop = document.createElementNS(SVG_NS, "line");
    const x = String(DROP_X[index] ?? 12);
    drop.setAttribute("x1", x);
    drop.setAttribute("x2", x);
    drop.setAttribute("y1", "21");
    drop.setAttribute("y2", "25");
    drop.classList.add("ride-map-cloud-drop");
    svg.append(drop);
  }

  return svg;
}
