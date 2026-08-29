import type { PrecipitationLevel } from "@/domain/weather/types";
import type { WeatherCloudMarker } from "./weather-overlay";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Lucide Cloud / CloudRain / CloudLightning, trimmed to what reads at 28 px. */
const CLOUD_BODY = "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z";

const RAIN_STREAKS: Record<PrecipitationLevel, string[]> = {
  clear: [],
  cloudy: [],
  showers: ["M8 19v2", "M12 19v3"],
  rain: ["M8 19v3", "M12 19v4", "M16 19v3"],
  storm: ["m13 19-3 5h4l-3 5"],
};

/**
 * FR-043 — the marker is the message: a pale cloud for an overcast sky, a
 * darker one with streaks as the chance of rain climbs, and a lightning bolt
 * for a storm. The percentage rides along so the rider never has to guess
 * what shade of grey they are looking at.
 */
export function createCloudMarkerElement(
  marker: WeatherCloudMarker,
): HTMLElement {
  const element = document.createElement("div");
  element.className = `ride-map-cloud ride-map-cloud--${marker.level}`;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", marker.label);
  element.dataset.level = marker.level;
  element.dataset.probability = String(marker.probability);

  element.append(createCloudGlyph(marker.level));

  const badge = document.createElement("span");
  badge.className = "ride-map-cloud-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = `${marker.probability} %`;
  element.append(badge);

  return element;
}

function createCloudGlyph(level: PrecipitationLevel): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("ride-map-cloud-icon");

  const body = document.createElementNS(SVG_NS, "path");
  body.setAttribute("d", CLOUD_BODY);
  svg.append(body);

  for (const streak of RAIN_STREAKS[level]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", streak);
    svg.append(path);
  }

  return svg;
}
