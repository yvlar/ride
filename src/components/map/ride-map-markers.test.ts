import { describe, expect, it } from "vitest";
import {
  applyMotorcyclePuckHeading,
  createDirectionArrowElement,
  createPlaceMarkerElement,
  createUserPuckElement,
  enhanceGeolocateDotWithMotorcycle,
  headingFromGeolocateEvent,
  MOTORCYCLE_NOSE_OFFSET_DEG,
  USER_LOCATION_LABEL,
} from "./ride-map-markers";

describe("ride map markers (FR-013)", () => {
  it("keeps arrow rotation on an inner element", () => {
    const element = createDirectionArrowElement(90);

    expect(element.style.transform).toBe("");
    expect(element.firstElementChild).toHaveClass("ride-map-arrow");
    expect(element.firstElementChild).toHaveStyle({ transform: "rotate(90deg)" });
  });

  it("exposes a text label that does not rely on color alone", () => {
    const element = createPlaceMarkerElement("Départ");

    expect(element).toHaveTextContent("Départ");
    expect(element).toHaveAttribute("aria-label", "Départ");
  });

  it("gives destination and GPX markers distinct semantic glyph hooks", () => {
    const destination = createPlaceMarkerElement(
      "Destination",
      "destination",
    );
    const entry = createPlaceMarkerElement("Entrée GPX", "entry");

    expect(destination).toHaveClass("ride-map-marker--destination");
    expect(entry).toHaveClass("ride-map-marker--entry");
    expect(destination.querySelector(".ride-map-marker-icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(destination).toHaveAttribute("aria-label", "Destination");
  });
});

describe("motorcycle user puck (FR-022)", () => {
  it("renders a motorcycle SVG with a north-facing nose offset", () => {
    const element = createUserPuckElement();
    const icon = element.querySelector("svg.ride-map-user-puck-icon");
    const heading = headingNode(element);

    expect(element).toHaveAttribute("aria-label", USER_LOCATION_LABEL);
    expect(element).toHaveAttribute("role", "img");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon?.querySelectorAll("path")).toHaveLength(3);
    expect(icon?.querySelectorAll("circle")).toHaveLength(2);
    expect(heading).toHaveClass("ride-map-user-puck-heading");
    expect(MOTORCYCLE_NOSE_OFFSET_DEG).toBe(-90);
  });

  it("rotates the inner heading node without touching the marker root", () => {
    const element = createUserPuckElement();
    const heading = headingNode(element);

    expect(applyMotorcyclePuckHeading(element, 90)).toBe(90);
    expect(element.style.transform).toBe("");
    expect(heading.style.transform).toBe("rotate(90deg)");
  });

  it("keeps the last valid heading when the next reading is unusable", () => {
    const element = createUserPuckElement();
    const heading = headingNode(element);

    applyMotorcyclePuckHeading(element, 45);
    expect(applyMotorcyclePuckHeading(element, Number.NaN)).toBeNull();
    expect(applyMotorcyclePuckHeading(element, null)).toBeNull();
    expect(heading.style.transform).toBe("rotate(45deg)");
  });

  it("replaces a MapLibre geolocate dot with the motorcycle puck", () => {
    const dot = document.createElement("div");
    dot.className = "maplibregl-user-location-dot";

    enhanceGeolocateDotWithMotorcycle(dot, 180);

    expect(dot).toHaveClass("ride-map-user-puck");
    expect(dot).toHaveAttribute("aria-label", USER_LOCATION_LABEL);
    expect(dot.querySelector("svg.ride-map-user-puck-icon")).not.toBeNull();
    const heading = headingNode(dot);
    expect(heading.style.transform).toBe("rotate(180deg)");

    enhanceGeolocateDotWithMotorcycle(dot, 270);
    expect(dot.querySelectorAll("svg.ride-map-user-puck-icon")).toHaveLength(1);
    expect(heading.style.transform).toBe("rotate(270deg)");
  });

  it("reads a finite heading from a geolocate event (FR-022)", () => {
    expect(
      headingFromGeolocateEvent({
        coords: { latitude: 45.4, longitude: -72.7, heading: 90 },
      }),
    ).toBe(90);
    expect(
      headingFromGeolocateEvent({
        coords: { latitude: 45.4, longitude: -72.7, heading: null },
      }),
    ).toBeNull();
    expect(headingFromGeolocateEvent({ heading: Number.NaN })).toBeNull();
    expect(headingFromGeolocateEvent(null)).toBeNull();
  });
});

function headingNode(root: HTMLElement): HTMLElement {
  const heading = root.querySelector<HTMLElement>(".ride-map-user-puck-heading");
  if (!heading) {
    throw new Error("missing motorcycle heading node");
  }
  return heading;
}
