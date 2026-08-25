"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  formatDistanceLabel,
  formatDurationLabel,
} from "@/components/navigation/format-navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { composeGpxRoute, gpxRideRequestFromRoute } from "@/domain/gpx/compose";
import { GPX_MAX_FILE_BYTES } from "@/domain/gpx/constants";
import { GPX_MULTI_TRIP_MESSAGE, GPX_SNAPPING_MESSAGE } from "@/domain/gpx/copy";
import { gpxFileInputAccept, isAcceptableGpxFile } from "@/domain/gpx/file-accept";
import { parseGpxDocument, tripNeedsRoutingSnap } from "@/domain/gpx/parse";
import type {
  GeneratedGpxRoute,
  GpxRideRequest,
  ParsedGpxTrip,
} from "@/domain/gpx/types";
import { readStoredRoutePreferences } from "@/domain/ride/stored-route-preferences";
import type { RideGenerationError } from "@/domain/ride/types";
import {
  requestSnapGpxWaypoints,
} from "@/components/gpx/request-snap-gpx-waypoints";

export type ImportGpxPanelProps = {
  snapWaypoints?: typeof requestSnapGpxWaypoints;
  initialRoute?: GeneratedGpxRoute | null;
  onPreview: (
    route: GeneratedGpxRoute | null,
    request: GpxRideRequest | null,
  ) => void;
  onStartNavigation: () => void;
  onBack: () => void;
  navigationActive?: boolean;
};

type SnapFn = typeof requestSnapGpxWaypoints;

export function ImportGpxPanel({
  snapWaypoints = requestSnapGpxWaypoints,
  initialRoute = null,
  onPreview,
  onStartNavigation,
  onBack,
  navigationActive = false,
}: ImportGpxPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [trips, setTrips] = useState<ParsedGpxTrip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [route, setRoute] = useState<GeneratedGpxRoute | null>(initialRoute);
  const [error, setError] = useState<RideGenerationError | null>(null);
  const [busy, setBusy] = useState(false);

  const abortInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    generationRef.current += 1;
  }, []);

  useEffect(() => {
    return () => {
      abortInFlight();
    };
  }, [abortInFlight]);

  function discardPreview() {
    abortInFlight();
    setTrips([]);
    setSelectedId(null);
    setWarnings([]);
    setRoute(null);
    setError(null);
    setBusy(false);
    setFileName(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onPreview(null, null);
  }

  async function applyTrip(
    trip: ParsedGpxTrip,
    name: string,
    extraWarnings: string[],
    snap: SnapFn,
  ): Promise<boolean> {
    generationRef.current += 1;
    const generation = generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const preferences = readStoredRoutePreferences(
      typeof window === "undefined" ? null : window.localStorage,
    );

    if (!tripNeedsRoutingSnap(trip)) {
      const composed = composeGpxRoute({
        trip,
        fileName: name,
        warnings: extraWarnings,
      });
      if (generation !== generationRef.current) {
        return false;
      }
      setRoute(composed);
      setError(null);
      setBusy(false);
      onPreview(composed, gpxRideRequestFromRoute(composed, preferences));
      return true;
    }

    setBusy(true);
    setError(null);
    const waypoints = trip.parts.flatMap((part) =>
      part.points.map((point) => point.coordinates),
    );
    const snapped = await snap({ waypoints, preferences }, controller.signal);
    if (generation !== generationRef.current || controller.signal.aborted) {
      return false;
    }
    if (!snapped.ok) {
      setBusy(false);
      setError(snapped.error);
      return false;
    }
    const composed = composeGpxRoute({
      trip,
      fileName: name,
      geometry: snapped.route.geometry,
      warnings: extraWarnings,
    });
    setRoute(composed);
    setError(null);
    setBusy(false);
    onPreview(composed, gpxRideRequestFromRoute(composed, preferences));
    return true;
  }

  async function handleFile(file: File) {
    abortInFlight();
    setError(null);
    setBusy(false);
    if (file.size > GPX_MAX_FILE_BYTES) {
      setError({
        code: "GPX_INVALID",
        message: "Le fichier GPX est trop volumineux pour être importé.",
        suggestions: ["Choisissez un fichier plus petit."],
      });
      return;
    }
    if (!isAcceptableGpxFile(file)) {
      setError({
        code: "GPX_INVALID",
        message: "Ce fichier n’est pas un GPX utilisable.",
        suggestions: ["Choisissez un fichier .gpx."],
      });
      return;
    }
    const xml = await file.text();
    const parsed = parseGpxDocument(xml, file.name);
    if (!parsed.ok) {
      setError({
        code: "GPX_INVALID",
        message: parsed.error.message,
        suggestions: ["Choisissez une trace ou une route GPX."],
      });
      return;
    }
    const first = parsed.trips[0];
    if (!first) {
      return;
    }
    const applied = await applyTrip(first, file.name, parsed.warnings, snapWaypoints);
    if (!applied) {
      return;
    }
    setFileName(file.name);
    setTrips(parsed.trips);
    setWarnings(parsed.warnings);
    setSelectedId(first.id);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    void handleFile(file);
  }

  const selected = trips.find((trip) => trip.id === selectedId) ?? null;
  const canStart = Boolean(route) && !busy && !navigationActive;

  return (
    <div data-testid="gpx-import-flow">
      <input
        ref={inputRef}
        id="gpx-file-input"
        data-testid="gpx-file-input"
        type="file"
        accept={gpxFileInputAccept()}
        className="sr-only"
        aria-label="Fichier GPX"
        onChange={handleInputChange}
      />

      <p className="text-sm text-muted-foreground">
        Importez une trace ou une route GPX. Le fichier est lu sur cet appareil.
      </p>

      {fileName ? (
        <p className="mt-2 text-sm">Fichier : {fileName}</p>
      ) : null}

      {busy ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {GPX_SNAPPING_MESSAGE}
        </p>
      ) : null}

      {trips.length > 1 ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium">{GPX_MULTI_TRIP_MESSAGE}</legend>
          {trips.map((trip) => (
            <button
              key={trip.id}
              type="button"
              role="radio"
              aria-checked={trip.id === selectedId}
              className={cn(
                "flex min-h-12 w-full items-center rounded-lg border border-border px-3 text-left text-base",
                trip.id === selectedId ? "bg-muted" : "",
              )}
              disabled={busy}
              onClick={() => {
                setSelectedId(trip.id);
                void applyTrip(trip, fileName ?? "trajet.gpx", warnings, snapWaypoints);
              }}
            >
              {trip.name}
              <span className="ml-auto text-sm text-muted-foreground">
                {trip.kind === "track" ? "Trace" : "Route"}
              </span>
            </button>
          ))}
        </fieldset>
      ) : null}

      {route ? (
        <section aria-label="Trajet GPX" className="mt-4 space-y-2">
          <p className="text-base font-medium leading-6">{route.name}</p>
          <p className="text-sm leading-6">
            {formatDistanceLabel(route.distanceKm)} ·{" "}
            {formatDurationLabel(route.durationMinutes)}
            {route.isClosedLoop ? " · Boucle" : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Départ : {route.start.label}
          </p>
          <p className="text-sm text-muted-foreground">
            Arrivée : {route.destination.label}
          </p>
          {warnings.length > 0 || route.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {[...new Set([...warnings, ...route.warnings])].map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {selected && trips.length === 1 && selected.kind === "route" ? (
            <p className="text-sm text-muted-foreground">
              Route GPX accrochée au réseau, sans réordonner les points.
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 space-y-2 text-sm leading-6">
          <p className="text-destructive">{error.message}</p>
          {error.suggestions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {error.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "sticky bottom-0 z-20 -mx-4 mt-3 space-y-2 border-t border-border bg-card/95 px-4 pt-3",
          "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
        )}
        role={route ? "group" : undefined}
        aria-label={route ? "Actions du trajet GPX" : undefined}
      >
        {route ? (
          <>
            <Button
              type="button"
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={!canStart}
              aria-label="Démarrer la navigation"
              onClick={onStartNavigation}
            >
              Démarrer la navigation
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={busy}
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.value = "";
                }
                inputRef.current?.click();
              }}
            >
              Choisir un autre fichier
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 w-full"
              disabled={busy}
              onClick={() => {
                discardPreview();
                onBack();
              }}
            >
              Annuler
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {fileName ? "Choisir un autre fichier" : "Choisir un fichier GPX"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 w-full"
              disabled={busy}
              onClick={() => {
                discardPreview();
                onBack();
              }}
            >
              Annuler
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
