"use client";

import { Button } from "@/components/ui/button";
import {
  APPROXIMATE_DESTINATION_NOTICE,
  destinationSummary,
} from "@/domain/destination/destination";
import type { Place } from "@/domain/geo/types";

export type SelectedDestinationCardProps = {
  destination: Place;
  /** Reopens the search field with the current text. */
  onEdit: () => void;
  /** Clears the destination entirely. */
  onClear: () => void;
  /** Offered for an approximate result, to nudge the marker (FR-038). */
  onAdjustOnMap?: () => void;
  disabled?: boolean;
};

/**
 * FR-038 — replaces the results list once a destination is confirmed, so the
 * rider always sees exactly what will be sent to the routing engine.
 */
export function SelectedDestinationCard({
  destination,
  onEdit,
  onClear,
  onAdjustOnMap,
  disabled = false,
}: SelectedDestinationCardProps) {
  const summary = destinationSummary(destination);

  return (
    <section
      aria-label="Destination sélectionnée"
      data-testid="selected-destination"
      data-precision={destination.precision}
      className="rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-medium">{summary.primary}</p>
          {summary.secondary ? (
            <p className="text-sm text-muted-foreground">{summary.secondary}</p>
          ) : null}
        </div>
        {summary.kindLabel ? (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {summary.kindLabel}
          </span>
        ) : null}
      </div>

      {summary.approximate ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {APPROXIMATE_DESTINATION_NOTICE}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-12 w-full text-base"
          disabled={disabled}
          onClick={onEdit}
        >
          Modifier
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 w-full text-base"
          disabled={disabled}
          onClick={onClear}
        >
          Effacer la destination
        </Button>
        {summary.approximate && onAdjustOnMap ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full text-base sm:col-span-2"
            disabled={disabled}
            onClick={onAdjustOnMap}
          >
            Ajuster sur la carte
          </Button>
        ) : null}
      </div>
    </section>
  );
}
