/**
 * FR-007, FR-008, FR-030 — only advertise preferences the current routing
 * adapters can actually honour. Tolls and ferries stay visible but disabled.
 */
export type RoutePreferenceKey =
  | "avoidHighways"
  | "avoidUnpaved"
  | "allowUnpaved"
  | "stayInCanada"
  | "avoidTolls"
  | "avoidFerries";

export type RoutePreferenceSupport = {
  key: RoutePreferenceKey;
  label: string;
  supported: boolean;
  mapsTo?: "avoidHighways" | "avoidUnpaved" | "stayInCanada";
  inverted?: boolean;
  explanation: string;
};

export const ROUTE_PREFERENCE_SUPPORT: RoutePreferenceSupport[] = [
  {
    key: "avoidHighways",
    label: "Éviter les autoroutes",
    supported: true,
    mapsTo: "avoidHighways",
    explanation: "Le moteur évite les autoroutes lorsqu’une alternative existe.",
  },
  {
    key: "avoidUnpaved",
    label: "Route asphaltée seulement",
    supported: true,
    mapsTo: "avoidUnpaved",
    explanation: "Les routes connues comme non pavées sont exclues.",
  },
  {
    key: "allowUnpaved",
    label: "Chemins non asphaltés autorisés",
    supported: true,
    mapsTo: "avoidUnpaved",
    inverted: true,
    explanation: "Autorise les surfaces non pavées connues.",
  },
  {
    key: "stayInCanada",
    label: "Canada seulement",
    supported: true,
    mapsTo: "stayInCanada",
    explanation: "Ne pas traverser aux États-Unis.",
  },
  {
    key: "avoidTolls",
    label: "Éviter les péages",
    supported: false,
    explanation:
      "Le moteur de routage actuel ne peut pas garantir l’évitement des péages.",
  },
  {
    key: "avoidFerries",
    label: "Éviter les traversiers",
    supported: false,
    explanation:
      "Le moteur de routage actuel ne peut pas garantir l’évitement des traversiers.",
  },
];

export function supportedRoutePreferenceKeys(): RoutePreferenceKey[] {
  return ROUTE_PREFERENCE_SUPPORT.filter((item) => item.supported).map(
    (item) => item.key,
  );
}
