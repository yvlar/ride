"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  formatDistanceLabel,
  formatDurationLabel,
} from "@/components/navigation/format-navigation";
import { composeGpxRoute, gpxRideRequestFromRoute } from "@/domain/gpx/compose";
import { parseGpxDocument } from "@/domain/gpx/parse";
import type { GeneratedGpxRoute, GpxRideRequest } from "@/domain/gpx/types";
import type {
  RouteCatalogFilter,
  RouteCatalogPage,
  RouteCatalogSummary,
} from "@/domain/route-catalog/types";
import {
  requestRouteCatalog,
  requestRouteCatalogGpx,
} from "./request-route-catalog";

export type RouteCatalogPanelProps = {
  loadCatalog?: typeof requestRouteCatalog;
  loadGpx?: typeof requestRouteCatalogGpx;
  onPreview: (route: GeneratedGpxRoute, request: GpxRideRequest) => void;
  onStartNavigation: () => void;
  onBack: () => void;
  navigationActive?: boolean;
};

export function RouteCatalogPanel({
  loadCatalog = requestRouteCatalog,
  loadGpx = requestRouteCatalogGpx,
  onPreview,
  onStartNavigation,
  onBack,
  navigationActive = false,
}: RouteCatalogPanelProps) {
  const [page, setPage] = useState<RouteCatalogPage | null>(null);
  const [countryCode, setCountryCode] = useState("");
  const [subdivisionCode, setSubdivisionCode] = useState("");
  const [regionSlug, setRegionSlug] = useState("");
  const [busy, setBusy] = useState(true);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const previewGeneration = useRef(0);
  const previewController = useRef<AbortController | null>(null);

  const filter = useMemo<RouteCatalogFilter>(
    () => ({
      countryCode: countryCode || undefined,
      subdivisionCode: subdivisionCode || undefined,
      regionSlug: regionSlug || undefined,
      locale: "fr",
      limit: 100,
    }),
    [countryCode, subdivisionCode, regionSlug],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadCatalog(filter, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setPage(next);
          setError(null);
          setBusy(false);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Catalogue indisponible.");
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [filter, loadCatalog, reloadKey]);

  useEffect(
    () => () => {
      previewGeneration.current += 1;
      previewController.current?.abort();
    },
    [],
  );

  const country = page?.countries.find((item) => item.code === countryCode) ?? null;
  const subdivisions = country?.subdivisions ?? [];
  const subdivision =
    subdivisions.find((item) => item.code === subdivisionCode) ?? null;
  const regions = subdivision?.regions ?? [];

  async function preview(summary: RouteCatalogSummary): Promise<void> {
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    previewGeneration.current += 1;
    const generation = previewGeneration.current;
    setLoadingSlug(summary.slug);
    setError(null);
    try {
      const downloaded = await loadGpx(summary.slug, controller.signal);
      if (generation !== previewGeneration.current) return;
      const parsed = parseGpxDocument(downloaded.xml, downloaded.filename);
      if (!parsed.ok) {
        throw new Error(parsed.error.message);
      }
      const trip = parsed.trips.find((item) => item.kind === "track") ?? parsed.trips[0];
      if (!trip) {
        throw new Error("Ce GPX ne contient aucun trajet exploitable.");
      }
      const route = composeGpxRoute({
        trip,
        fileName: downloaded.filename,
        warnings: parsed.warnings,
        id: `catalog:${summary.slug}`,
      });
      setSelectedSlug(summary.slug);
      onPreview(route, gpxRideRequestFromRoute(route));
    } catch (reason) {
      if (generation === previewGeneration.current && !controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Fichier GPX indisponible.");
      }
    } finally {
      if (generation === previewGeneration.current) {
        previewController.current = null;
        setLoadingSlug(null);
      }
    }
  }

  function reload(): void {
    setBusy(true);
    setError(null);
    setReloadKey((value) => value + 1);
  }

  return (
    <div data-testid="route-catalog">
      <p className="text-sm text-muted-foreground">
        Choisissez un pays, une province ou un État, puis une région. Le GPX est
        chargé seulement lorsque vous ouvrez un trajet.
      </p>

      {page ? (
        <div className="mt-3 grid gap-2">
          <CatalogSelect
            label="Pays"
            value={countryCode}
            allLabel="Tous les pays"
            options={page.countries.map((item) => ({
              value: item.code,
              label: `${item.name} (${item.routeCount})`,
            }))}
            onChange={(value) => {
              setBusy(true);
              setCountryCode(value);
              setSubdivisionCode("");
              setRegionSlug("");
            }}
          />
          <CatalogSelect
            label="Province ou État"
            value={subdivisionCode}
            allLabel="Toutes les provinces et tous les États"
            disabled={!countryCode}
            options={subdivisions.map((item) => ({
              value: item.code,
              label: `${item.name} (${item.routeCount})`,
            }))}
            onChange={(value) => {
              setBusy(true);
              setSubdivisionCode(value);
              setRegionSlug("");
            }}
          />
          <CatalogSelect
            label="Région"
            value={regionSlug}
            allLabel="Toutes les régions"
            disabled={!subdivisionCode}
            options={regions.map((item) => ({
              value: item.slug,
              label: `${item.name} (${item.routeCount})`,
            }))}
            onChange={(value) => {
              setBusy(true);
              setRegionSlug(value);
            }}
          />
        </div>
      ) : null}

      {busy ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Chargement des trajets…
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="mt-4 rounded-lg border border-destructive/40 p-3">
          <p className="text-sm">{error}</p>
          {!page ? (
            <Button type="button" variant="outline" className="mt-2 min-h-12" onClick={reload}>
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}

      {!busy && page && page.routes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Aucun trajet publié dans cette partie du catalogue pour le moment.
        </p>
      ) : null}

      {page && page.routes.length > 0 ? (
        <ul className="mt-4 space-y-3" aria-label="Trajets du catalogue">
          {page.routes.map((route) => (
            <li key={route.slug} className="rounded-xl border border-border p-3">
              <p className="font-medium">{route.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {route.location.country.name} · {route.location.subdivision.name} ·{" "}
                {route.location.region.name}
              </p>
              <p className="mt-1 text-sm">
                {formatDistanceLabel(route.distanceKm)} ·{" "}
                {formatDurationLabel(route.durationMinutes)} ·{" "}
                {difficultyLabel(route.difficulty)}
              </p>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {route.description}
              </p>
              <Button
                type="button"
                variant={selectedSlug === route.slug ? "secondary" : "outline"}
                className="mt-3 min-h-12 w-full"
                disabled={loadingSlug !== null}
                onClick={() => void preview(route)}
              >
                {loadingSlug === route.slug
                  ? "Chargement du GPX…"
                  : selectedSlug === route.slug
                    ? "Trajet affiché sur la carte"
                    : "Afficher sur la carte"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedSlug ? (
        <Button
          type="button"
          size="lg"
          className="mt-4 min-h-12 w-full text-base"
          disabled={navigationActive || loadingSlug !== null}
          onClick={onStartNavigation}
        >
          Démarrer la navigation
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        className="mt-2 min-h-12 w-full"
        onClick={onBack}
      >
        Retour
      </Button>
    </div>
  );
}

function CatalogSelect({
  label,
  value,
  allLabel,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select
        className="min-h-12 rounded-lg border border-input bg-background px-3 text-base"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function difficultyLabel(value: RouteCatalogSummary["difficulty"]): string {
  if (value === "easy") return "Facile";
  if (value === "challenging") return "Exigeant";
  return "Intermédiaire";
}
