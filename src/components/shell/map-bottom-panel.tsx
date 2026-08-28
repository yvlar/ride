import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function MapBottomPanel({
  title,
  titleHidden,
  children,
  className,
}: {
  title?: string;
  /** Keeps the panel's accessible name while dropping the visible heading. */
  titleHidden?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "pointer-events-auto max-h-[70dvh] overflow-y-auto rounded-t-3xl border border-border bg-card/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/40" />
      {title && !titleHidden ? (
        <h1 className="mb-3 text-xl font-semibold tracking-tight">{title}</h1>
      ) : null}
      {children}
    </section>
  );
}
