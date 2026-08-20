"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Place } from "@/domain/geo/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function LocateButton({
  onLocated,
  onError,
}: {
  onLocated: (place: Place) => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 shrink-0 px-3"
      disabled={pending}
      onClick={() => {
        if (!navigator.geolocation) {
          onError("La géolocalisation n’est pas disponible sur cet appareil.");
          return;
        }

        setPending(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setPending(false);
            onLocated({
              label: "Position actuelle",
              coordinates: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              },
            });
          },
          (error) => {
            setPending(false);
            if (error.code === error.PERMISSION_DENIED) {
              onError(
                "Autorisez la position actuelle pour l’utiliser comme départ.",
              );
              return;
            }
            onError("Impossible d’obtenir la position actuelle.");
          },
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
        );
      }}
    >
      Ma position
    </Button>
  );
}
