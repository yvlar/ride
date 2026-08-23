import type { NavigationManeuverModifier, NavigationStep } from "@/domain/navigation/types";

export function maneuverArrow(step: NavigationStep | null): string {
  if (!step) {
    return "↑";
  }
  if (step.maneuverType === "roundabout") {
    return "↻";
  }
  if (step.maneuverType === "uturn" || step.modifier === "uturn") {
    return "↩";
  }
  if (step.maneuverType === "arrive") {
    return "⚑";
  }
  return arrowForModifier(step.modifier);
}

function arrowForModifier(modifier: NavigationManeuverModifier): string {
  switch (modifier) {
    case "left":
    case "sharp_left":
      return "←";
    case "slight_left":
      return "↖";
    case "right":
    case "sharp_right":
      return "→";
    case "slight_right":
      return "↗";
    case "uturn":
      return "↩";
    default:
      return "↑";
  }
}
