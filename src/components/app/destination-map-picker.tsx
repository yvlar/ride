"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DestinationPickerMap } from "@/components/map/destination-picker-map";
import type { DestinationPickerMapEngine } from "@/components/map/destination-picker-map-engine";
import { DEFAULT_EXPLORER_CENTER } from "@/components/map/ride-map-view-model";
import { Button } from "@/components/ui/button";
import { hasValidCoordinates } from "@/domain/geo/coordinates";
import {
  placePrecisionLabel,
  placeSecondaryLine,
  placeTypeLabel,
} from "@/domain/geo/place-display";
import type { Coordinates, Place } from "@/domain/geo/types";

export type DestinationMapPickerProps = {
  currentPosition?: Coordinates | null;
  initialDestination?: Place | null;
  reversePlace: (coordinates: Coordinates) => Promise<Place>;
  mapEngine?: DestinationPickerMapEngine;
  onCancel: () => void;
  onConfirm: (place: Place) => void;
};

export function DestinationMapPicker({
  currentPosition = null,
  initialDestination = null,
  reversePlace,
  mapEngine,
  onCancel,
  onConfirm,
}: DestinationMapPickerProps) {
  const [draft, setDraft] = useState<Place | null>(initialDestination);
  const [reverseStatus, setReverseStatus] = useState<
    "idle" | "loading" | "success" | "fallback"
  >(initialDestination ? "success" : "idle");
  const reverseGeneration = useRef(0);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const center =
    initialDestination?.coordinates ?? currentPosition ?? DEFAULT_EXPLORER_CENTER;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      reverseGeneration.current += 1;
    };
  }, []);

  function handlePick(coordinates: Coordinates) {
    if (!hasValidCoordinates(coordinates)) {
      return;
    }
    const generation = reverseGeneration.current + 1;
    reverseGeneration.current = generation;
    const fallback = selectedPointFallback(coordinates);
    setDraft(fallback);
    setReverseStatus("loading");
    void reversePlace(coordinates)
      .then((place) => {
        if (reverseGeneration.current !== generation) {
          return;
        }
        setDraft({
          ...place,
          coordinates,
          source: "map",
          precision: "exact",
        });
        setReverseStatus("success");
      })
      .catch(() => {
        if (reverseGeneration.current !== generation) {
          return;
        }
        setDraft(fallback);
        setReverseStatus("fallback");
      });
  }

  if (typeof document === "undefined") {
    return null;
  }

  const secondary = draft ? placeSecondaryLine(draft) : null;
  const precision = draft ? placePrecisionLabel(draft) : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choisir une destination sur la carte"
      className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel();
        }
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div>
          <h2 className="text-lg font-semibold">Choisir sur la carte</h2>
          <p className="text-xs text-muted-foreground">
            Appui prolongé sur mobile ou clic sur ordinateur
          </p>
        </div>
        <Button
          ref={cancelButtonRef}
          type="button"
          variant="ghost"
          onClick={onCancel}
        >
          Annuler
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        <DestinationPickerMap
          center={center}
          userLocation={currentPosition}
          initialDestination={initialDestination}
          engine={mapEngine}
          onPick={handlePick}
        />
      </div>

      <section className="space-y-3 border-t border-border bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg">
        {draft ? (
          <div aria-label="Point choisi" className="space-y-1">
            <p className="font-medium">{draft.label}</p>
            {secondary ? (
              <p className="text-sm text-muted-foreground">{secondary}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {placeTypeLabel(draft)}
              {precision ? ` · ${precision}` : ""} · {formatCoordinates(draft.coordinates)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Placez le marqueur pour définir la destination.
          </p>
        )}
        {reverseStatus === "loading" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Recherche de l’adresse…
          </p>
        ) : null}
        {reverseStatus === "fallback" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Aucune adresse trouvée. Les coordonnées sélectionnées seront utilisées.
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="min-h-12 w-full text-base"
          disabled={!draft || !hasValidCoordinates(draft.coordinates)}
          onClick={() => {
            if (draft && hasValidCoordinates(draft.coordinates)) {
              onConfirm(draft);
            }
          }}
        >
          Utiliser cette destination
        </Button>
      </section>
    </div>,
    document.body,
  );
}

function selectedPointFallback(coordinates: Coordinates): Place {
  return {
    label: "Point sélectionné sur la carte",
    name: "Point sélectionné sur la carte",
    coordinates,
    type: "place",
    source: "map",
    precision: "exact",
  };
}

function formatCoordinates(coordinates: Coordinates): string {
  return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
}
