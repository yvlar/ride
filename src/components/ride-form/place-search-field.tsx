"use client";

import { useRef, useEffect, useReducer, useState, type ReactNode } from "react";
import type { Coordinates, Place } from "@/domain/geo/types";
import {
  placePrecisionLabel,
  placePrimaryName,
  placeSecondaryLine,
  placeTypeLabel,
} from "@/domain/geo/place-display";
import { normalizeGeocodingQuery } from "@/domain/geo/canadian-postal-code";
import {
  classifySearchFailure,
  emptyPlaceSearchState,
  reducePlaceSearch,
} from "@/domain/search/place-search";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  proximity?: Coordinates | null;
  searchPlaces?: (
    query: string,
    signal?: AbortSignal,
    proximity?: Coordinates,
  ) => Promise<Place[]>;
  showSelectedStatus?: boolean;
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
  debounceMs = 300,
  proximity = null,
  searchPlaces = searchPlacesFromApi,
  showSelectedStatus = true,
  onQueryChange,
  onPlaceSelected,
  action,
}: PlaceSearchFieldProps) {
  const listId = `${id}-suggestions`;
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const [search, dispatch] = useReducer(reducePlaceSearch, emptyPlaceSearchState());
  const [retrySequence, setRetrySequence] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    dispatch({ type: "query", query });
  }, [query]);

  const trimmedQuery = query.trim();
  const proximityLatitude = proximity?.latitude;
  const proximityLongitude = proximity?.longitude;
  const canSearch =
    trimmedQuery.length >= 2 && selectedPlace?.label !== trimmedQuery;

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (!canSearch) {
      return;
    }

    const queryToSearch = normalizeGeocodingQuery(trimmedQuery);
    const displayedQuery = trimmedQuery;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    dispatch({ type: "begin", query: displayedQuery, generation });
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => {
      const searchProximity =
        proximityLatitude !== undefined && proximityLongitude !== undefined
          ? {
              latitude: proximityLatitude,
              longitude: proximityLongitude,
            }
          : undefined;
      void searchPlaces(queryToSearch, controller.signal, searchProximity)
        .then((places) => {
          setActiveIndex(-1);
          dispatch({
            type: "success",
            generation,
            query: displayedQuery,
            places,
          });
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          dispatch({
            type: "failure",
            generation,
            reason: classifySearchFailure(reason),
          });
        });
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    canSearch,
    debounceMs,
    proximityLatitude,
    proximityLongitude,
    retrySequence,
    searchPlaces,
    trimmedQuery,
  ]);

  const suggestions = search.status === "results" ? search.places : [];
  const liveStatus =
    search.status === "offline" || search.status === "provider_error"
      ? search.error
      : search.status === "loading"
        ? "Recherche…"
        : search.status === "no_results"
          ? search.error
          : null;

  function selectPlace(place: Place) {
    abortRef.current?.abort();
    setActiveIndex(-1);
    dispatch({ type: "select", place });
    onPlaceSelected(place);
  }

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
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? errorId : null, liveStatus ? statusId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            abortRef.current?.abort();
            setActiveIndex(-1);
            dispatch({ type: "query", query: event.target.value });
            onQueryChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              abortRef.current?.abort();
              setActiveIndex(-1);
              dispatch({ type: "cancel" });
              return;
            }
            if (suggestions.length === 0) {
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) =>
                current >= suggestions.length - 1 ? 0 : current + 1,
              );
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) =>
                current <= 0 ? suggestions.length - 1 : current - 1,
              );
              return;
            }
            if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              const place = suggestions[activeIndex];
              if (place) {
                selectPlace(place);
              }
            }
          }}
          className="h-12 min-h-12 text-base"
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
          {suggestions.map((place, index) => {
            const secondary = placeSecondaryLine(place);
            const precision = placePrecisionLabel(place);
            return (
              <li
                key={
                  place.id ??
                  `${place.label}-${place.coordinates.latitude}-${place.coordinates.longitude}`
                }
              >
                <button
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-label={place.label}
                  aria-selected={activeIndex === index}
                  className="flex min-h-14 w-full flex-col items-start justify-center gap-1 px-3 py-2 text-left hover:bg-muted aria-selected:bg-muted"
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => selectPlace(place)}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-base font-medium">
                      {placePrimaryName(place)}
                    </span>
                    <Badge variant="secondary">{placeTypeLabel(place)}</Badge>
                  </span>
                  {secondary ? (
                    <span className="text-sm text-muted-foreground">{secondary}</span>
                  ) : null}
                  {precision ? (
                    <span className="text-xs text-muted-foreground">{precision}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {liveStatus ? (
        <div className="flex items-center justify-between gap-2">
          <p id={statusId} role="status" className="text-sm text-muted-foreground">
            {liveStatus}
          </p>
          {search.status === "offline" || search.status === "provider_error" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRetrySequence((value) => value + 1)}
            >
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {showSelectedStatus && selectedPlace && !error ? (
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
      className="h-12 min-h-12 min-w-[7.5rem] shrink-0 px-3"
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
                ...place,
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
