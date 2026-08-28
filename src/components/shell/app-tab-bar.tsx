"use client";

import { Compass, MapPinned, Bookmark, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppTab = "explore" | "rides" | "saved" | "settings";

const TABS: {
  id: AppTab;
  label: string;
  icon: typeof Compass;
}[] = [
  { id: "explore", label: "Explorer", icon: Compass },
  { id: "rides", label: "Mes trajets", icon: MapPinned },
  { id: "saved", label: "Enregistrés", icon: Bookmark },
  { id: "settings", label: "Réglages", icon: Settings },
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
    <nav
      aria-label="Navigation principale"
      /* `relative z-30`: the map is absolutely positioned and would otherwise
         paint its attribution control over this bar (FR-042). */
      className="relative z-30 grid grid-cols-4 border-t border-border bg-card/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md"
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
              "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium",
              selected ? "text-primary" : "text-muted-foreground",
            )}
            onClick={() => onChange(tab.id)}
          >
            <Icon aria-hidden="true" className="size-5" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
