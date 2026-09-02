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

export type CloudMarkerOptions = {
  /**
   * FR-046 — draw the cloud as an arcade character with a face instead of the
   * plain glyph. Only the Kart Arcade theme asks for it.
   */
  faces?: boolean;
};

/**
 * FR-043 — the marker is the message: a pale cloud for an overcast sky, a
 * darker one with streaks as the chance of rain climbs, and a lightning bolt
 * for a storm. The percentage rides along so the rider never has to guess
 * what shade of grey they are looking at.
 */
export function createCloudMarkerElement(
  marker: WeatherCloudMarker,
  options: CloudMarkerOptions = {},
): HTMLElement {
  const element = document.createElement("div");
  element.className = `ride-map-cloud ride-map-cloud--${marker.level}`;
  if (options.faces) {
    element.classList.add("ride-map-cloud--arcade");
  }
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", marker.label);
  element.dataset.level = marker.level;
  element.dataset.probability = String(marker.probability);

  element.append(
    options.faces
      ? createArcadeCloudGlyph(marker.level)
      : createCloudGlyph(marker.level),
  );

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

/*
 * FR-046 — the Kart Arcade sky. Every other marker of this theme is a solid
 * shape with an ink outline; a thin Lucide outline floating over it read as a
 * leftover from another map. So the cloud becomes a character: a puffy body,
 * two eyes, and a mood that follows the level.
 *
 * The mood is a *second* reading of what the badge and the accessible name
 * already say (FR-043, NFR-001) — a scowl is faster to catch through a visor
 * than a shade of blue, but nothing rests on it alone.
 *
 * Every curve below is drawn for Ride. Like the racing disc and the start
 * chevron of `ride-map-markers.css`, it is neither traced from nor modelled on
 * any published game's artwork.
 */

/** Its own box, wider than the Lucide grid, so a face fits without shrinking. */
const ARCADE_VIEW_BOX = "3 4 42 38";

/*
 * Three lobes welded into one silhouette — a tall dome in the middle, a
 * shoulder either side — over a flat base at y=30. Each arc ends exactly where
 * the lobe circles cross ((14.5,22.5) r7.5, (24.5,16.5) r10.5, (34,22.5) r7.5),
 * so the outline reads as one puffy shape rather than three circles with seams.
 */
const ARCADE_CLOUD_BODY =
  "M7 22.5 A7.5 7.5 0 0 1 14.11 15.01 A10.5 10.5 0 0 1 34.9 15.05 " +
  "A7.5 7.5 0 0 1 41.5 22.5 A7.5 7.5 0 0 1 34 30 L14.5 30 " +
  "A7.5 7.5 0 0 1 7 22.5 Z";

/** Both eyes sit in the middle lobe, low enough to leave room for the brows. */
const EYE = { leftX: 20.3, rightX: 28.7, y: 19.3, rx: 3.5, ry: 3.8 } as const;
const PUPIL_RADIUS = 1.8;

type CloudMood = "calm" | "worried" | "sad" | "angry";

/** `clear` never reaches here — the overlay drops those samples — but the
 * record stays total so a new level cannot slip through undrawn. */
const CLOUD_MOODS: Record<PrecipitationLevel, CloudMood> = {
  clear: "calm",
  cloudy: "calm",
  showers: "worried",
  rain: "sad",
  storm: "angry",
};

type CloudFace = {
  /** How far the pupils sit below the centre of the eye: a look, not a stare. */
  pupilOffsetY: number;
  brows: readonly string[];
  /** Half-closed lids, drawn across the eyes. Empty for a wide-open face. */
  lids: readonly string[];
  mouth: string;
  /** A filled mouth reads as a shout; the others are a drawn line. */
  mouthFilled: boolean;
};

const CLOUD_FACES: Record<CloudMood, CloudFace> = {
  // Overcast and unbothered: flat brows, heavy lids, a small level mouth.
  calm: {
    pupilOffsetY: 1,
    brows: ["M17.4 13.4h5.8", "M25.8 13.4h5.8"],
    lids: ["M16.9 17.4h6.8", "M25.3 17.4h6.8"],
    mouth: "M22.5 25.6h4",
    mouthFilled: false,
  },
  // Showers on the way: inner brows lifted, eyes down, an unsure wavy mouth.
  worried: {
    pupilOffsetY: 1.3,
    brows: ["M17.3 14.3 L23.2 12.5", "M31.7 14.3 L25.8 12.5"],
    lids: [],
    mouth: "M20.9 25.6q1.8-1.5 3.6 0q1.8 1.5 3.6 0",
    mouthFilled: false,
  },
  // Raining: brows steeply pitched and the mouth turned right over.
  sad: {
    pupilOffsetY: 1.6,
    brows: ["M17.1 15.1 L23.3 11.9", "M31.9 15.1 L25.7 11.9"],
    lids: [],
    mouth: "M20.8 26.4q3.7-3.2 7.4 0",
    mouthFilled: false,
  },
  // Storm: brows driven into a V, mouth wide open.
  angry: {
    pupilOffsetY: -0.3,
    brows: ["M17.1 11.8 L23.2 15", "M31.9 11.8 L25.8 15"],
    lids: [],
    mouth: "M21.3 24.2q3.2-1.2 6.4 0q-0.95 3.6-3.2 3.6q-2.25 0-3.2-3.6z",
    mouthFilled: true,
  },
};

type CloudWeatherArt = {
  /** Rain falling out of the bottom of the cloud. */
  streaks: readonly string[];
  /** Tears, drawn on the face rather than under the cloud. */
  tears: readonly string[];
  bolt: string | null;
};

const CLOUD_WEATHER_ART: Record<PrecipitationLevel, CloudWeatherArt> = {
  clear: { streaks: [], tears: [], bolt: null },
  cloudy: { streaks: [], tears: [], bolt: null },
  showers: { streaks: ["M17.5 31.5v3.4", "M26.5 31.5v5"], tears: [], bolt: null },
  rain: {
    streaks: ["M15.5 31.5v4.2", "M23.5 31.5v6.6", "M31.5 31.5v4.2"],
    tears: ["M30.3 23.6c1.7 2.3 1.7 3.4 0 4.2c-1.7-0.8-1.7-1.9 0-4.2z"],
    bolt: null,
  },
  storm: {
    streaks: [],
    tears: [],
    // Hung off to one side so it never blurs into the shouting mouth above.
    bolt: "M23.6 30.6 L16.4 36.4h3.6l-1.6 3.2l7.2-5.8h-3.6z",
  },
};

function createArcadeCloudGlyph(level: PrecipitationLevel): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", ARCADE_VIEW_BOX);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("ride-map-cloud-icon", "ride-map-cloud-icon--arcade");

  svg.append(pathNode(ARCADE_CLOUD_BODY, "ride-map-cloud-body"));

  const art = CLOUD_WEATHER_ART[level];
  const weather = document.createElementNS(SVG_NS, "g");
  weather.classList.add("ride-map-cloud-weather");
  if (art.bolt) {
    weather.append(pathNode(art.bolt, "ride-map-cloud-bolt"));
  }
  for (const streak of art.streaks) {
    weather.append(pathNode(streak, "ride-map-cloud-streak"));
  }
  svg.append(weather);

  svg.append(createCloudFace(CLOUD_FACES[CLOUD_MOODS[level]], art.tears));

  return svg;
}

function createCloudFace(
  face: CloudFace,
  tears: readonly string[],
): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("ride-map-cloud-face");

  for (const x of [EYE.leftX, EYE.rightX]) {
    group.append(eyeNode(x));
  }
  for (const x of [EYE.leftX, EYE.rightX]) {
    group.append(pupilNode(x, EYE.y + face.pupilOffsetY));
  }
  for (const lid of face.lids) {
    group.append(pathNode(lid, "ride-map-cloud-lid"));
  }
  for (const brow of face.brows) {
    group.append(pathNode(brow, "ride-map-cloud-brow"));
  }
  for (const tear of tears) {
    group.append(pathNode(tear, "ride-map-cloud-tear"));
  }

  const mouth = pathNode(face.mouth, "ride-map-cloud-mouth");
  if (face.mouthFilled) {
    mouth.classList.add("ride-map-cloud-mouth--open");
  }
  group.append(mouth);

  return group;
}

function eyeNode(centerX: number): SVGEllipseElement {
  const eye = document.createElementNS(SVG_NS, "ellipse");
  eye.classList.add("ride-map-cloud-eye");
  eye.setAttribute("cx", String(centerX));
  eye.setAttribute("cy", String(EYE.y));
  eye.setAttribute("rx", String(EYE.rx));
  eye.setAttribute("ry", String(EYE.ry));
  return eye;
}

function pupilNode(centerX: number, centerY: number): SVGCircleElement {
  const pupil = document.createElementNS(SVG_NS, "circle");
  pupil.classList.add("ride-map-cloud-pupil");
  pupil.setAttribute("cx", String(centerX));
  pupil.setAttribute("cy", String(centerY));
  pupil.setAttribute("r", String(PUPIL_RADIUS));
  return pupil;
}

function pathNode(d: string, className: string): SVGPathElement {
  const path = document.createElementNS(SVG_NS, "path");
  path.classList.add(className);
  path.setAttribute("d", d);
  return path;
}
