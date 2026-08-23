import { describe, expect, it } from "vitest";
import {
  createDirectionArrowElement,
  createPlaceMarkerElement,
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
});
