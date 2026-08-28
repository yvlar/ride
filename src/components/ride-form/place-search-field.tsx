"use client";

import {
  useRef,
  useEffect,
  useReducer,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { destinationKindLabel } from "@/domain/destination/destination";
import type { Coordinates, Place } from "@/domain/geo/types";
import { placePrimaryName, placeSecondaryLine } from "@/domain/geo/place-display";
import {
  classifySearchFailure,
  emptyPlaceSearchState,
  reducePlaceSearch,
} from "@/domain/search/place-search";
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
import { cn } from "@/lib/utils";

export const PLACE_SEARCH_DEBOUNCE_MS = 300;

export type PlaceSearchFieldProps = {
  id: string;
  label: string;
  query: string;
  selectedPlace: Place | null;
  error?: string;
  placeholder?: string;
  debounceMs?: number;
  searchPlaces?: (query: string, signal?: AbortSignal) => Promise<Place[]>;
  onQueryChange: (query: string) => void;
  onPlaceSelected: (place: Place) => void;
  action?: ReactNode;
  /** Rendered under the field, e.g. the FR-038 "Choisir sur la carte" button. */
  footer?: ReactNode;
  /** Shown when the field is empty and nothing has been typed yet. */
  hint?: string;
};

export function PlaceSearchField({
  id,
  label,
  query,
  selectedPlace,
  error,
  placeholder,
  debounceMs = PLACE_SEARCH_DEBOUNCE_MS,
  searchPlaces = searchPlacesFromApi,
  onQueryChange,
  onPlaceSelected,
  action,
  footer,
  hint,
}: PlaceSearchFieldProps) {
  const listId = `${id}-suggestions`;
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const [search, dispatch] = useReducer(reducePlaceSearch, emptyPlaceSearchState());
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Bumping this re-runs the search effect for the same query (Réessayer).
  const [retryToken, setRetryToken] = useState(0);
  // Tied to the search generation so a new query resets the highlight without
  // an effect: the reducer already bumps the generation on every new search.
  const [active, setActive] = useState({ generation: -1, index: -1 });

  useEffect(() => {
    dispatch({ type: "query", query });
  }, [query]);

  const trimmedQuery = query.trim();
  const canSearch =
    trimmedQuery.length >= 2 && selectedPlace?.label !== trimmedQuery;

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (!canSearch) {
      return;
    }

    const queryToSearch = trimmedQuery;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    dispatch({ type: "begin", query: queryToSearch, generation });
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => {
      void searchPlaces(queryToSearch, controller.signal)
        .then((places) => {
          dispatch({
            type: "success",
            generation,
            query: queryToSearch,
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
  }, [canSearch, debounceMs, searchPlaces, trimmedQuery, retryToken]);

  const suggestions = search.status === "results" ? search.places : [];
  const failed =
    search.status === "offline" || search.status === "provider_error";
  const liveStatus = failed
    ? search.error
    : search.status === "loading"
      ? "Recherche…"
      : search.status === "no_results"
        ? search.error
        : null;

  // Never preselect an ambiguous first result (FR-032): the highlight only
  // exists once the rider moves onto a row.
  const activeIndex =
    active.generation === search.generation &&
    active.index < suggestions.length
      ? active.index
      : -1;

  function setActiveIndex(next: number): void {
    setActive({ generation: search.generation, index: next });
  }

  const activeOptionId =
    activeIndex >= 0 && activeIndex < suggestions.length
      ? `${listId}-option-${activeIndex}`
      : undefined;

  function selectPlace(place: Place): void {
    abortRef.current?.abort();
    dispatch({ type: "select", place });
    onPlaceSelected(place);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (suggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(activeIndex + 1 >= suggestions.length ? 0 : activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(suggestions.length - 1);
      return;
    }
    if (event.key === "Enter") {
      const place = suggestions[activeIndex];
      // Enter only commits a result the rider actually moved onto.
      if (place) {
        event.preventDefault();
        selectPlace(place);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setActiveIndex(-1);
      dispatch({ type: "cancel" });
    }
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
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? errorId : null, liveStatus ? statusId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            abortRef.current?.abort();
            dispatch({ type: "query", query: event.target.value });
            onQueryChange(event.target.value);
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
            const kindLabel = destinationKindLabel(place);
            return (
              <li key={`${place.label}-${place.coordinates.latitude}`}>
                <button
                  type="button"
                  role="option"
                  id={`${listId}-option-${index}`}
                  aria-label={place.label}
                  aria-selected={index === activeIndex}
                  data-active={index === activeIndex ? "true" : undefined}
                  className={cn(
                    "flex min-h-12 w-full flex-col items-start justify-center px-3 py-2 text-left hover:bg-muted",
                    index === activeIndex ? "bg-muted" : undefined,
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectPlace(place)}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-base font-medium">
                      {placePrimaryName(place)}
                    </span>
                    {kindLabel ? (
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {kindLabel}
                      </span>
                    ) : null}
                  </span>
                  {secondary ? (
                    <span className="text-sm text-muted-foreground">{secondary}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {liveStatus ? (
        <p id={statusId} role="status" className="text-sm text-muted-foreground">
          {liveStatus}
        </p>
      ) : null}
      {failed ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-12 w-full text-base"
          onClick={() => setRetryToken((value) => value + 1)}
        >
          Réessayer
        </Button>
      ) : null}
      {hint && search.status === "empty" ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
      {footer}
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
