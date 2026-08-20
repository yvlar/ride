"use client";

import { useState, type FormEvent } from "react";
import { composeRideRequest } from "@/domain/ride/compose-request";
import { hoursToMinutes } from "@/domain/ride/duration";
import { summarizeRideRequest } from "@/domain/ride/summarize-request";
import type { Place } from "@/domain/geo/types";
import type {
  GenerateRideRequest,
  RideFormError,
  RideFormField,
  RideStyle,
  RideType,
} from "@/domain/ride/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  LocateButton,
  PlaceSearchField,
} from "@/components/ride-form/place-search-field";
import { cn } from "@/lib/utils";

const RIDE_TYPES: { value: RideType; label: string; description: string }[] = [
  {
    value: "loop",
    label: "Boucle",
    description: "Revenir au départ",
  },
  {
    value: "destination",
    label: "Destination",
    description: "Aller simple",
  },
  {
    value: "round_trip",
    label: "Aller-retour",
    description: "Retour différent",
  },
];

const RIDE_STYLES: { value: RideStyle; label: string }[] = [
  { value: "curvy", label: "Courbes" },
  { value: "scenic", label: "Panoramique" },
  { value: "touring", label: "Touring" },
];

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

function errorMap(errors: RideFormError[]): Partial<Record<RideFormField, string>> {
  const mapped: Partial<Record<RideFormField, string>> = {};
  for (const error of errors) {
    mapped[error.field] ??= error.message;
  }
  return mapped;
}

export type RideRequestFormProps = {
  searchPlaces?: (query: string) => Promise<Place[]>;
  debounceMs?: number;
  onRequestComposed?: (request: GenerateRideRequest) => void;
};

export function RideRequestForm({
  searchPlaces,
  debounceMs = 250,
  onRequestComposed,
}: RideRequestFormProps) {
  const [startQuery, setStartQuery] = useState("");
  const [start, setStart] = useState<Place | null>(null);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  const [type, setType] = useState<RideType>("loop");
  const [targetDistanceKm, setTargetDistanceKm] = useState("");
  const [availableDurationHours, setAvailableDurationHours] = useState("");
  const [style, setStyle] = useState<RideStyle>("scenic");
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidUnpaved, setAvoidUnpaved] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<RideFormField, string>>>(
    {},
  );
  const [status, setStatus] = useState<string | null>(null);

  const needsDestination = type !== "loop";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const durationHours = parseOptionalNumber(availableDurationHours);
    const result = composeRideRequest({
      start,
      type,
      destination: needsDestination ? destination : null,
      targetDistanceKm: parseOptionalNumber(targetDistanceKm),
      availableDurationMinutes:
        durationHours === null ? null : hoursToMinutes(durationHours),
      style,
      preferences: {
        avoidHighways,
        avoidUnpaved,
      },
    });

    if (!result.ok) {
      setErrors(errorMap(result.errors));
      return;
    }

    setErrors({});
    setStatus(summarizeRideRequest(result.request));
    onRequestComposed?.(result.request);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Composer la ride</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <PlaceSearchField
            id="start"
            label="Point de départ"
            query={startQuery}
            selectedPlace={start}
            error={errors.start}
            placeholder="Rechercher un lieu"
            debounceMs={debounceMs}
            searchPlaces={searchPlaces}
            onQueryChange={(query) => {
              setStartQuery(query);
              setStart((current) =>
                current && current.label === query ? current : null,
              );
              setErrors((current) => ({ ...current, start: undefined }));
            }}
            onPlaceSelected={(place) => {
              setStart(place);
              setStartQuery(place.label);
              setErrors((current) => ({ ...current, start: undefined }));
            }}
            action={
              <LocateButton
                onLocated={(place) => {
                  setStart(place);
                  setStartQuery(place.label);
                  setErrors((current) => ({ ...current, start: undefined }));
                }}
                onError={(message) => {
                  setStart(null);
                  setErrors((current) => ({ ...current, start: message }));
                }}
              />
            }
          />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Type de trajet</legend>
            <div
              role="radiogroup"
              aria-label="Type de trajet"
              className="grid grid-cols-1 gap-2"
            >
              {RIDE_TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={type === option.value}
                  className={cn(
                    "flex min-h-12 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors",
                    type === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                  onClick={() => {
                    setType(option.value);
                    setErrors((current) => ({
                      ...current,
                      type: undefined,
                      destination: undefined,
                      targetDistanceKm: undefined,
                    }));
                    setStatus(null);
                  }}
                >
                  <span className="text-base font-medium">{option.label}</span>
                  <span
                    className={cn(
                      "text-sm",
                      type === option.value
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {needsDestination ? (
            <PlaceSearchField
              id="destination"
              label="Destination"
              query={destinationQuery}
              selectedPlace={destination}
              error={errors.destination}
              placeholder="Rechercher une destination"
              debounceMs={debounceMs}
              searchPlaces={searchPlaces}
              onQueryChange={(query) => {
                setDestinationQuery(query);
                setDestination((current) =>
                  current && current.label === query ? current : null,
                );
                setErrors((current) => ({
                  ...current,
                  destination: undefined,
                }));
              }}
              onPlaceSelected={(place) => {
                setDestination(place);
                setDestinationQuery(place.label);
                setErrors((current) => ({
                  ...current,
                  destination: undefined,
                }));
              }}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="target-distance">Distance cible (km)</Label>
              <Input
                id="target-distance"
                inputMode="decimal"
                placeholder="ex. 200"
                value={targetDistanceKm}
                aria-invalid={errors.targetDistanceKm ? true : undefined}
                aria-describedby={
                  errors.targetDistanceKm
                    ? "target-distance-error"
                    : undefined
                }
                onChange={(event) => {
                  setTargetDistanceKm(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    targetDistanceKm: undefined,
                  }));
                }}
                className="h-12 text-base"
              />
              {errors.targetDistanceKm ? (
                <p
                  id="target-distance-error"
                  className="text-sm text-destructive"
                >
                  {errors.targetDistanceKm}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="available-duration">Durée disponible (h)</Label>
              <Input
                id="available-duration"
                inputMode="decimal"
                placeholder="ex. 3"
                value={availableDurationHours}
                aria-invalid={
                  errors.availableDurationMinutes ? true : undefined
                }
                onChange={(event) => {
                  setAvailableDurationHours(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    availableDurationMinutes: undefined,
                  }));
                }}
                className="h-12 text-base"
              />
              {errors.availableDurationMinutes ? (
                <p className="text-sm text-destructive">
                  {errors.availableDurationMinutes}
                </p>
              ) : null}
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Style de trajet</legend>
            <div
              role="radiogroup"
              aria-label="Style de trajet"
              className="grid grid-cols-3 gap-2"
            >
              {RIDE_STYLES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={style === option.value}
                  className={cn(
                    "flex min-h-12 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors sm:text-base",
                    style === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                  onClick={() => setStyle(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
              <Label htmlFor="avoid-highways" className="text-base">
                Éviter les autoroutes
              </Label>
              <Switch
                id="avoid-highways"
                checked={avoidHighways}
                onCheckedChange={setAvoidHighways}
              />
            </div>
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
              <Label htmlFor="avoid-unpaved" className="text-base">
                Éviter les routes non pavées
              </Label>
              <Switch
                id="avoid-unpaved"
                checked={avoidUnpaved}
                onCheckedChange={setAvoidUnpaved}
              />
            </div>
          </div>

          <Button type="submit" size="lg" className="min-h-12 w-full text-base">
            Générer ma ride
          </Button>

          {status ? (
            <p role="status" className="text-sm leading-6 text-muted-foreground">
              {status}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
