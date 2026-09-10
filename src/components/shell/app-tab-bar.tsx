"use client";

import { Compass, MapPinned, Bookmark, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppTab = "explore" | "rides" | "saved" | "settings";

const TABS: {
  id: Exclude<AppTab, "settings">;
  label: string;
  icon: typeof Compass;
}[] = [
  { id: "explore", label: "Explorer", icon: Compass },
  { id: "rides", label: "Mes trajets", icon: MapPinned },
  { id: "saved", label: "Enregistrés", icon: Bookmark },
];

export function AppTabBar({
  value,
  onChange,
  hidden,
}: {
  value: AppTab;
  onChange: (tab: AppTab) => void;
  hidden?: boolean;
}) {
  if (hidden) {
    return null;
  }

  return (
    <>
      {value === "explore" ? (
        <>
          <style>{`
            /* Explorer map controls: location left, app settings right. */
            .maplibregl-ctrl-top-right {
              left: max(0.75rem, env(safe-area-inset-left, 0px));
              right: auto;
            }
          `}</style>
          <button
            type="button"
            aria-label="Réglages"
            data-testid="explorer-settings-button"
            className="maplibregl-ctrl maplibregl-ctrl-group fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] z-50 flex size-11 items-center justify-center overflow-hidden rounded-[4px] border-0 bg-white p-0 text-slate-700 shadow-[0_0_0_2px_rgba(0,0,0,0.1)] transition-colors hover:bg-slate-50 active:bg-slate-100"
            onClick={() => onChange("settings")}
          >
            <Settings aria-hidden="true" className="size-5" />
          </button>
        </>
      ) : null}
      <nav
        aria-label="Navigation principale"
        /* `relative z-30`: the map is absolutely positioned and would otherwise
         * paint its attribution control over this bar (FR-042). */
        className="ride-tab-bar ride-glass-strong relative z-30 grid grid-cols-3 rounded-t-[1.75rem] px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-medium transition-colors",
                "ride-tab-button",
                selected
                  ? "ride-tab-button-active bg-white/14 text-white"
                  : "text-white/65 hover:text-white",
              )}
              onClick={() => onChange(tab.id)}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span className="ride-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
