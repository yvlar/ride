import type { RideStyle } from "@/domain/ride/types";

export type RideStyleOption = {
  id: "curvy" | "scenic" | "touring" | "fastest" | "adventure";
  label: string;
  description: string;
  style?: RideStyle;
  supported: boolean;
  unsupportedReason?: string;
};

/**
 * FR-019 — supported domain styles. Adventure stays visible but disabled so
 * the UI never pretends the generator can honour it.
 */
export const RIDE_STYLE_OPTIONS: RideStyleOption[] = [
  {
    id: "curvy",
    label: "Routes sinueuses",
    description: "Virages et routes secondaires",
    style: "curvy",
    supported: true,
  },
  {
    id: "scenic",
    label: "Panoramique",
    description: "Campagne, lacs et belvédères",
    style: "scenic",
    supported: true,
  },
  {
    id: "touring",
    label: "Équilibré",
    description: "Conduite fluide, routes confortables",
    style: "touring",
    supported: true,
  },
  {
    id: "fastest",
    label: "Rapide",
    description: "Le temps de parcours le plus court",
    style: "fastest",
    supported: true,
  },
  {
    id: "adventure",
    label: "Aventure",
    description: "Gravier et chemins",
    supported: false,
    unsupportedReason:
      "Le style aventure n’est pas offert. Autorisez les chemins non asphaltés au besoin.",
  },
];

export const RIDE_STYLE_LABELS: Record<RideStyle, string> = {
  curvy: "Routes sinueuses",
  scenic: "Panoramique",
  touring: "Équilibré",
  fastest: "Le plus rapide",
};
