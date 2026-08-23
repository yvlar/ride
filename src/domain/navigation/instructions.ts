import { GENERIC_CONTINUE_INSTRUCTION } from "./constants";
import type {
  NavigationManeuverModifier,
  NavigationStep,
} from "./types";

const EXIT_ORDINALS: Record<number, string> = {
  1: "première",
  2: "deuxième",
  3: "troisième",
  4: "quatrième",
  5: "cinquième",
  6: "sixième",
  7: "septième",
  8: "huitième",
  9: "neuvième",
  10: "dixième",
};

export function formatFrenchInstruction(step: NavigationStep): string {
  if (step.maneuverType === "unknown") {
    return GENERIC_CONTINUE_INSTRUCTION;
  }
  if (step.maneuverType === "arrive") {
    return "Vous êtes arrivé à destination.";
  }
  if (step.maneuverType === "depart") {
    return withRoad("Départ", step);
  }

  if (step.maneuverType === "roundabout") {
    const place = step.rotaryName
      ? `Au carrefour giratoire ${step.rotaryName}`
      : "Au rond-point";
    if (step.exit) {
      return `${place}, prenez la ${exitLabel(step.exit)} sortie.`;
    }
    return `${place}, continuez.`;
  }

  if (step.maneuverType === "on_ramp") {
    if (step.destinations) {
      return `Prenez la bretelle vers ${step.destinations}.`;
    }
    return withRoad("Prenez la bretelle", step);
  }

  if (step.maneuverType === "off_ramp") {
    if (step.destinations) {
      return `Prenez la sortie vers ${step.destinations}.`;
    }
    return withRoad("Prenez la sortie", step);
  }

  if (step.maneuverType === "uturn") {
    return withRoad("Faites demi-tour", step);
  }

  if (step.maneuverType === "fork") {
    return withRoad(`À la bifurcation, ${directionVerb(step.modifier)}`, step);
  }

  if (step.maneuverType === "merge") {
    return withRoad("Rejoignez la voie", step);
  }

  if (step.maneuverType === "end_of_road") {
    return withRoad(`Au bout de la route, ${turnVerb(step.modifier)}`, step);
  }

  if (step.maneuverType === "new_name") {
    return withRoad("Continuez", step);
  }

  if (step.maneuverType === "continue") {
    const duration = formatDistanceForSpeech(step.distanceKm);
    if (duration && (step.modifier === "straight" || step.modifier === "unknown")) {
      return `Continuez tout droit pendant ${duration}.`;
    }
    return withRoad(continueVerb(step.modifier), step);
  }

  return withRoad(turnVerb(step.modifier), step);
}

export function formatDistanceForSpeech(distanceKm: number): string | null {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return null;
  }
  if (distanceKm < 1) {
    const meters = Math.max(1, Math.round(distanceKm * 1_000));
    return `${meters} mètre${meters === 1 ? "" : "s"}`;
  }
  const rounded =
    distanceKm >= 10 ? Math.round(distanceKm) : Math.round(distanceKm * 10) / 10;
  const label = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", ",");
  return `${label} kilomètre${rounded === 1 ? "" : "s"}`;
}

export function roadLabel(step: NavigationStep): string | undefined {
  const ref = step.ref?.trim();
  const name = step.name?.trim();
  if (ref && name) {
    if (name.toLowerCase().includes(ref.toLowerCase())) {
      return name;
    }
    return `la route ${ref}`;
  }
  if (ref) {
    return `la route ${ref}`;
  }
  return name || undefined;
}

function withRoad(lead: string, step: NavigationStep): string {
  const road = roadLabel(step);
  if (!road) {
    return `${lead}.`;
  }
  if (road.startsWith("la ")) {
    return `${lead} sur ${road}.`;
  }
  return `${lead} sur ${road}.`;
}

function exitLabel(exit: number): string {
  return EXIT_ORDINALS[exit] ?? `${exit}e`;
}

function turnVerb(modifier: NavigationManeuverModifier): string {
  switch (modifier) {
    case "left":
      return "Tournez à gauche";
    case "right":
      return "Tournez à droite";
    case "sharp_left":
      return "Tournez fortement à gauche";
    case "sharp_right":
      return "Tournez fortement à droite";
    case "slight_left":
      return "Tournez légèrement à gauche";
    case "slight_right":
      return "Tournez légèrement à droite";
    case "uturn":
      return "Faites demi-tour";
    case "straight":
      return "Continuez tout droit";
    default:
      return "Tournez";
  }
}

function continueVerb(modifier: NavigationManeuverModifier): string {
  if (modifier === "left" || modifier === "slight_left" || modifier === "sharp_left") {
    return "Continuez à gauche";
  }
  if (modifier === "right" || modifier === "slight_right" || modifier === "sharp_right") {
    return "Continuez à droite";
  }
  return "Continuez tout droit";
}

function directionVerb(modifier: NavigationManeuverModifier): string {
  if (modifier === "left" || modifier === "slight_left" || modifier === "sharp_left") {
    return "prenez à gauche";
  }
  if (modifier === "right" || modifier === "slight_right" || modifier === "sharp_right") {
    return "prenez à droite";
  }
  return "continuez";
}
