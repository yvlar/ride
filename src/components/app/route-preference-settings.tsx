"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { StoredRouteStyle } from "@/domain/ride/stored-route-preferences";
import type { RoutePreferences } from "@/domain/ride/types";
import { cn } from "@/lib/utils";

const ROUTE_STYLE_OPTIONS: {
  value: StoredRouteStyle;
  label: string;
  description: string;
}[] = [
  {
    value: "scenic",
    label: "Panoramique",
    description: "Privilégie les routes agréables et les paysages.",
  },
  {
    value: "fastest",
    label: "Le plus rapide",
    description: "Minimise le temps de parcours; les autoroutes restent permises.",
  },
];

export function RouteStyleSettings({
  value,
  onChange,
}: {
  value: StoredRouteStyle;
  onChange: (next: StoredRouteStyle) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Style de trajet</legend>
      <div className="grid grid-cols-2 gap-2">
        {ROUTE_STYLE_OPTIONS.map((option) => {
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

export function RoutePreferenceSettings({
  value,
  onChange,
  idPrefix = "settings",
}: {
  value: RoutePreferences;
  onChange: (next: RoutePreferences) => void;
  idPrefix?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Préférences de route</legend>
      <div className="ride-control-row flex items-center justify-between gap-3">
        <Label htmlFor={`${idPrefix}-avoid-highways`} className="text-base">
          Éviter les autoroutes
        </Label>
        <Switch
          id={`${idPrefix}-avoid-highways`}
          checked={value.avoidHighways}
          onCheckedChange={(checked) =>
            onChange({ ...value, avoidHighways: checked })
          }
        />
      </div>
      <div className="ride-control-row flex items-center justify-between gap-3">
        <Label htmlFor={`${idPrefix}-avoid-unpaved`} className="text-base">
          Éviter les routes non pavées
        </Label>
        <Switch
          id={`${idPrefix}-avoid-unpaved`}
          checked={value.avoidUnpaved}
          onCheckedChange={(checked) =>
            onChange({ ...value, avoidUnpaved: checked })
          }
        />
      </div>
      <div className="ride-control-row flex items-center justify-between gap-3">
        <Label htmlFor={`${idPrefix}-stay-in-canada`} className="text-base">
          Canada seulement
        </Label>
        <Switch
          id={`${idPrefix}-stay-in-canada`}
          checked={Boolean(value.stayInCanada)}
          onCheckedChange={(checked) =>
            onChange({ ...value, stayInCanada: checked })
          }
        />
      </div>
    </fieldset>
  );
}
