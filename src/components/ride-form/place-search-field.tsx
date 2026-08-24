"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";
import type { Coordinates, Place } from "@/domain/geo/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrentPositionError } from "@/components/ride-form/browser-geolocation";
import { requestDeviceCoordinates } from "@/infrastructure/location/request-device-coordinates";
import {
  CURRENT_POSITION_ADDRESS_UNAVAILABLE_MESSAGE,
  currentPositionFallback,
  reverseGeocodePlace,
} from "@/components/ride-form/reverse-geocode-place";
import { searchPlacesFromApi } from "@/components/ride-form/search-places";

export type PlaceSearchFieldProps = {
  id: string;
  label: string;
  query: string;
  selectedPlace: Place | null;
  error?: string;
  placeholder?: string;
  debounceMs?: number;
  searchPlaces?: (query: string) => Promise<Place[]>;
  onQueryChange: (query: string) => void;
  onPlaceSelected: (place: Place) => void;
  action?: ReactNode;
};

export function PlaceSearchField({
  id,
  label,
  query,
  selectedPlace,
  error,
  placeholder,
  debounceMs = 250,
  searchPlaces = searchPlacesFromApi,
  onQueryChange,
  onPlaceSelected,
  action,
}: PlaceSearchFieldProps) {
  const listId = `${id}-suggestions`;
  const errorId = `${id}-error`;
  const [fetched, setFetched] = useState<{
    query: string;
    places: Place[];
    error: string | null;
  }>({ query: "", places: [], error: null });
  const [dismissed, setDismissed] = useState(false);

  const trimmedQuery = query.trim();
  const canSearch =
    trimmedQuery.length >= 2 &&
    selectedPlace?.label !== trimmedQuery;

  useEffect(() => {
    if (!canSearch) {
      return;
    }

    const queryToSearch = trimmedQuery;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchPlaces(queryToSearch)
        .then((places) => {
          if (!cancelled) {
            setFetched({ query: queryToSearch, places, error: null });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFetched({
              query: queryToSearch,
              places: [],
              error: "La recherche de lieu a échoué.",
            });
          }
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canSearch, debounceMs, searchPlaces, trimmedQuery]);

  const suggestions =
    canSearch && !dismissed && fetched.query === trimmedQuery
      ? fetched.places
      : [];
  const searchError =
    canSearch && fetched.query === trimmedQuery ? fetched.error : null;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setDismissed(false);
            onQueryChange(event.target.value);
          }}
          className="h-12 text-base"
        />
        {action}
      </div>
      {suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Suggestions pour ${label}`}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          {suggestions.map((place) => (
            <li key={`${place.label}-${place.coordinates.latitude}`}>
              <button
                type="button"
                role="option"
                aria-selected={selectedPlace?.label === place.label}
                className="flex min-h-12 w-full items-center px-3 text-left text-base hover:bg-muted"
                onClick={() => {
                  setDismissed(true);
                  onPlaceSelected(place);
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchError ? (
        <p className="text-sm text-destructive">{searchError}</p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {selectedPlace && !error ? (
        <p className="text-sm text-muted-foreground">
          Lieu sélectionné : {selectedPlace.label}
        </p>
      ) : null}
    </div>
  );
}

export type LocateButtonProps = {
  onLocated: (place: Place, warning?: string) => void;
  onError: (message: string) => void;
  requestCoordinates?: () => Promise<Coordinates>;
  reversePlace?: (coordinates: Coordinates) => Promise<Place>;
};

export function LocateButton({
  onLocated,
  onError,
  requestCoordinates = requestDeviceCoordinates,
  reversePlace = reverseGeocodePlace,
}: LocateButtonProps) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 min-w-[7.5rem] shrink-0 px-3"
      disabled={pending}
      aria-busy={pending}
      aria-live="polite"
      onClick={() => {
        if (pendingRef.current) {
          return;
        }

        pendingRef.current = true;
        setPending(true);

        void requestCoordinates()
          .then(async (coordinates) => {
            try {
              const place = await reversePlace(coordinates);
              onLocated({
                label: place.label,
                coordinates,
              });
            } catch {
              onLocated(
                currentPositionFallback(coordinates),
                CURRENT_POSITION_ADDRESS_UNAVAILABLE_MESSAGE,
              );
            }
          })
          .catch((error: unknown) => {
            const message =
              error instanceof CurrentPositionError
                ? error.message
                : new CurrentPositionError("unknown").message;
            onError(message);
          })
          .finally(() => {
            pendingRef.current = false;
            setPending(false);
          });
      }}
    >
      {pending ? "Localisation…" : "Ma position"}
    </Button>
  );
}
