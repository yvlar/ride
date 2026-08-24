export function createPlaceMarkerElement(label: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "ride-map-marker";
  element.textContent = label;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", label);
  return element;
}

export function createUserPuckElement(): HTMLElement {
  const element = document.createElement("div");
  element.className = "ride-map-user-puck";
  element.setAttribute("aria-label", "Position actuelle");
  const icon = document.createElement("div");
  icon.className = "ride-map-user-puck-icon";
  icon.setAttribute("aria-hidden", "true");
  element.append(icon);
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
