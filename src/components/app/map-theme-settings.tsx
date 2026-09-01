"use client";

import type { MapTheme } from "@/domain/map/map-theme";
import { cn } from "@/lib/utils";

const MAP_THEME_OPTIONS: {
  value: MapTheme;
  label: string;
  description: string;
}[] = [
  {
    value: "auto",
    label: "Automatique",
    description: "Suit l’apparence de l’application.",
  },
  {
    value: "light",
    label: "Clair",
    description: "Fond de carte clair, lisible en plein soleil.",
  },
  {
    value: "dark",
    label: "Sombre",
    description: "Fond sombre, moins éblouissant la nuit.",
  },
  {
    value: "satellite",
    label: "Satellite",
    description: "Imagerie aérienne; pas de bâtiments 3D.",
  },
  {
    value: "terrain",
    label: "Relief",
    description: "Courbes de niveau et relief; pas de bâtiments 3D.",
  },
  {
    value: "kart-arcade",
    label: "Kart Arcade",
    description: "Carte vectorielle colorée, ludique et lisible à moto.",
  },
];

/** FR-045 — le fond de carte choisi dans Réglages, conservé d’une session à l’autre. */
export function MapThemeSettings({
  value,
  onChange,
}: {
  value: MapTheme;
  onChange: (next: MapTheme) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Thème de carte</legend>
      <div className="grid grid-cols-2 gap-2">
        {MAP_THEME_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "min-h-24 rounded-2xl border px-3 py-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/70 bg-background/45 text-muted-foreground",
              )}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-1 block text-xs leading-relaxed">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
