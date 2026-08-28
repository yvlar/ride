"use client";

import { useEffect, useReducer, useRef } from "react";
import { RideMap } from "@/components/map/ride-map";
import { reverseGeocodePlace } from "@/components/ride-form/reverse-geocode-place";
import { Button } from "@/components/ui/button";
import {
  APPROXIMATE_DESTINATION_NOTICE,
  destinationSummary,
} from "@/domain/destination/destination";
import {
  canConfirmMapPick,
  createMapPickState,
  MAP_PICK_REVERSE_PENDING_MESSAGE,
  reduceMapPick,
} from "@/domain/destination-search/map-pick";
import type { Coordinates, Place } from "@/domain/geo/types";
import type { MapEngine } from "./map-engine";

export const MAP_PICKER_TITLE = "Choisir sur la carte";
export const MAP_PICKER_HINT =
  "Appui long sur la carte (ou clic sur ordinateur) pour placer la destination. Le marqueur peut ensuite être déplacé.";

export type DestinationMapPickerProps = {
  engine?: MapEngine;
  /** Current GPS position, shown on the map so the rider can orient. */
  userLocation?: Coordinates | null;
  /** Destination already selected, used as the starting marker. */
  initialPoint?: Coordinates | null;
  reversePlace?: (coordinates: Coordinates) => Promise<Place>;
  onConfirm: (destination: Place) => void;
  onCancel: () => void;
};

/**
 * FR-038 — full-screen map for picking a destination by hand.
 *
 * Reverse geocoding only decorates the label: a point is confirmable the
 * moment it is placed, so a geocoder outage never blocks the rider.
 * Cancelling leaves the previously selected destination untouched.
 */
export function DestinationMapPicker({
  engine,
  userLocation = null,
  initialPoint = null,
  reversePlace = reverseGeocodePlace,
  onConfirm,
  onCancel,
}: DestinationMapPickerProps) {
  const [state, dispatch] = useReducer(
    reduceMapPick,
    initialPoint,
    createMapPickState,
  );
  const generationRef = useRef(state.generation);
  const reversePlaceRef = useRef(reversePlace);

  useEffect(() => {
    reversePlaceRef.current = reversePlace;
  }, [reversePlace]);

  function handlePick(coordinates: Coordinates) {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    dispatch({ type: "place_point", coordinates, generation });

    void reversePlaceRef
      .current(coordinates)
      .then((place) => {
        dispatch({ type: "reverse_success", generation, place });
      })
      .catch(() => {
        dispatch({ type: "reverse_failure", generation });
      });
  }

  const summary = state.place ? destinationSummary(state.place) : null;
  const canConfirm = canConfirmMapPick(state);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={MAP_PICKER_TITLE}
      data-testid="destination-map-picker"
      data-pick-status={state.status}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-base font-medium">{MAP_PICKER_TITLE}</h2>
        <Button
          type="button"
          variant="ghost"
          className="min-h-12 min-w-12"
          onClick={onCancel}
        >
          Annuler
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        <RideMap
          route={null}
          engine={engine}
          fill
          label="Carte de sélection de la destination"
          userLocation={userLocation}
          pickMode
          pickMarker={state.point}
          onPick={handlePick}
        />
      </div>

      <div className="space-y-2 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {state.point ? (
          <div>
            <p className="text-base font-medium">
              {state.status === "reverse_geocoding"
                ? MAP_PICK_REVERSE_PENDING_MESSAGE
                : (summary?.primary ?? "")}
            </p>
            {state.status !== "reverse_geocoding" && summary?.secondary ? (
              <p className="text-sm text-muted-foreground">
                {summary.secondary}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {summary?.coordinatesLabel}
            </p>
            {summary?.approximate ? (
              <p className="text-sm text-muted-foreground">
                {APPROXIMATE_DESTINATION_NOTICE}
              </p>
            ) : null}
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {MAP_PICKER_HINT}
          </p>
        )}

        <Button
          type="button"
          size="lg"
          className="min-h-12 w-full text-base"
          disabled={!canConfirm}
          onClick={() => {
            if (state.place) {
              onConfirm(state.place);
            }
          }}
        >
          Utiliser cette destination
        </Button>
      </div>
    </div>
  );
}
