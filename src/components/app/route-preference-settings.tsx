"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { RoutePreferences } from "@/domain/ride/types";

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
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
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
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
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
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
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
