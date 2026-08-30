import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function MapBottomPanel({
  title,
  titleHidden,
  children,
  className,
  variant = "sheet",
}: {
  title?: string;
  /** Keeps the panel's accessible name while dropping the visible heading. */
  titleHidden?: boolean;
  children: ReactNode;
  className?: string;
  variant?: "sheet" | "floating";
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "ride-map-panel pointer-events-auto max-h-[76dvh] overflow-y-auto",
        variant === "sheet"
          ? "ride-glass-strong rounded-t-[2rem] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          : "mx-auto w-[calc(100%-1.5rem)] max-w-[30rem] px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {variant === "sheet" ? (
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/35" />
      ) : null}
      {title && !titleHidden ? (
        <h1 className={cn(
          "mb-3 text-xl font-semibold tracking-tight",
          variant === "floating" && "ride-glass rounded-3xl px-4 py-3 text-white",
        )}>{title}</h1>
      ) : null}
      {children}
    </section>
  );
}
