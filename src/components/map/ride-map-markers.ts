const SVG_NS = "http://www.w3.org/2000/svg";

/** Lucide Motorbike faces east; rotate so the nose is north (heading 0). */
export const MOTORCYCLE_NOSE_OFFSET_DEG = -90;

export const USER_LOCATION_LABEL = "Position actuelle";

const MOTORCYCLE_PATHS = [
  "m18 14-1-3",
  "m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81",
  "M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5",
] as const;

const MOTORCYCLE_WHEELS = [
  { cx: 19, cy: 17, r: 3 },
  { cx: 5, cy: 17, r: 3 },
] as const;

/**
 * FR-046 — what a marker *is*, not what it looks like. The theme stylesheet
 * turns the kind into a badge; the text label always stays, so the meaning is
 * never carried by colour or shape alone (NFR-001).
 */
export type PlaceMarkerKind = "start" | "destination" | "entry";

export function createPlaceMarkerElement(
  label: string,
  kind: PlaceMarkerKind = "start",
): HTMLElement {
  const element = document.createElement("div");
  element.className = `ride-map-marker ride-map-marker-${kind}`;
  element.dataset.markerKind = kind;
  // The label lives in its own node so a theme can stack a badge above it
  // without losing the text. `textContent` still reads back as the label.
  const text = document.createElement("span");
  text.className = "ride-map-marker-label";
  text.textContent = label;
  element.append(text);
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", label);
  return element;
}

export const PICK_MARKER_LABEL = "Destination choisie sur la carte";

/** FR-038 — the draggable pin the rider places and adjusts. */
export function createPickMarkerElement(): HTMLElement {
  const element = document.createElement("div");
  element.className = "ride-map-pick-marker";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", PICK_MARKER_LABEL);
  return element;
}

export function createUserPuckElement(): HTMLElement {
  const element = document.createElement("div");
  element.className = "ride-map-user-puck";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", USER_LOCATION_LABEL);
  element.append(createMotorcycleHeadingElement());
  return element;
}

/** Rotation lives on an inner node so MapLibre can own the marker transform. */
export function createDirectionArrowElement(bearingDeg: number): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  const icon = document.createElement("div");
  icon.className = "ride-map-arrow";
  icon.style.transform = `rotate(${bearingDeg}deg)`;
  element.append(icon);
  return element;
}

export function wrapHeadingDeg(headingDeg: number): number {
  return ((headingDeg % 360) + 360) % 360;
}

export function headingFromGeolocateEvent(event: unknown): number | null {
  const coords = geolocateCoords(event);
  if (!coords || !("heading" in coords)) {
    return null;
  }
  const heading = coords.heading;
  if (typeof heading !== "number" || !Number.isFinite(heading)) {
    return null;
  }
  return wrapHeadingDeg(heading);
}

export function applyMotorcyclePuckHeading(
  root: HTMLElement,
  headingDeg: number | null | undefined,
): number | null {
  const headingNode = root.querySelector<HTMLElement>(
    ".ride-map-user-puck-heading",
  );
  if (!headingNode) {
    return null;
  }
  if (typeof headingDeg !== "number" || !Number.isFinite(headingDeg)) {
    return null;
  }
  const wrapped = wrapHeadingDeg(headingDeg);
  headingNode.style.transform = `rotate(${wrapped}deg)`;
  return wrapped;
}

/** Replace MapLibre's default blue dot with the motorcycle puck (FR-022). */
export function enhanceGeolocateDotWithMotorcycle(
  dot: HTMLElement,
  headingDeg?: number | null,
): void {
  dot.classList.add("ride-map-user-puck");
  dot.setAttribute("role", "img");
  dot.setAttribute("aria-label", USER_LOCATION_LABEL);
  if (!dot.querySelector(".ride-map-user-puck-heading")) {
    dot.append(createMotorcycleHeadingElement());
  }
  applyMotorcyclePuckHeading(dot, headingDeg);
}

export function createMotorcycleSvgGlyph(options?: {
  size?: number;
  stroke?: string;
}): SVGGElement {
  const size = options?.size ?? 32;
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("aria-hidden", "true");
  group.setAttribute("data-motorcycle-glyph", "true");
  const scale = size / 24;
  group.setAttribute(
    "transform",
    `rotate(${MOTORCYCLE_NOSE_OFFSET_DEG}) scale(${scale}) translate(-12 -12)`,
  );
  appendMotorcycleGlyph(group, options?.stroke ?? "#f8fafc");
  return group;
}

function createMotorcycleHeadingElement(): HTMLElement {
  const heading = document.createElement("div");
  heading.className = "ride-map-user-puck-heading";
  heading.append(createMotorcycleIconElement());
  return heading;
}

function createMotorcycleIconElement(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ride-map-user-puck-icon");
  appendMotorcycleGlyph(svg, "currentColor");
  return svg;
}

function appendMotorcycleGlyph(parent: SVGElement, stroke: string): void {
  parent.setAttribute("fill", "none");
  parent.setAttribute("stroke", stroke);
  parent.setAttribute("stroke-width", "2");
  parent.setAttribute("stroke-linecap", "round");
  parent.setAttribute("stroke-linejoin", "round");
  for (const d of MOTORCYCLE_PATHS) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    parent.append(path);
  }
  for (const wheel of MOTORCYCLE_WHEELS) {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(wheel.cx));
    circle.setAttribute("cy", String(wheel.cy));
    circle.setAttribute("r", String(wheel.r));
    parent.append(circle);
  }
}

function geolocateCoords(event: unknown): object | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  if ("coords" in event && event.coords && typeof event.coords === "object") {
    return event.coords;
  }
  return event;
}
