"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Clock3,
  Compass,
  Gauge,
  LoaderCircle,
  Map,
  MapPin,
  Mountain,
  Route as RouteIcon,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
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
    <div data-testid="route-catalog" className="space-y-3 text-white">
      {page ? (
        <div
          className="ride-glass grid grid-cols-3 gap-1.5 rounded-3xl p-2"
          aria-label="Filtres du catalogue"
        >
          <CatalogSelect
            label="Pays"
            value={countryCode}
            allLabel="Tous les pays"
            icon={MapPin}
            options={page.countries.map((item) => ({ value: item.code, label: item.name }))}
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
            allLabel="Province"
            disabled={!countryCode}
            icon={Mountain}
            options={subdivisions.map((item) => ({ value: item.code, label: item.name }))}
            onChange={(value) => {
              setBusy(true);
              setSubdivisionCode(value);
              setRegionSlug("");
            }}
          />
          <CatalogSelect
            label="Région"
            value={regionSlug}
            allLabel="Région"
            disabled={!subdivisionCode}
            icon={Compass}
            options={regions.map((item) => ({ value: item.slug, label: item.name }))}
            onChange={(value) => {
              setBusy(true);
              setRegionSlug(value);
            }}
          />
        </div>
      ) : null}

      {busy ? (
        <div
          role="status"
          className="ride-glass flex min-h-24 items-center justify-center gap-2 rounded-3xl px-4 text-sm text-white/75"
        >
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          Chargement des trajets…
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="ride-glass rounded-3xl border-destructive/50 p-3">
          <p className="text-sm">{error}</p>
          {!page ? (
            <Button
              type="button"
              variant="ride"
              className="mt-2 min-h-12 w-full rounded-2xl"
              onClick={reload}
            >
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}

      {!busy && page && page.routes.length === 0 ? (
        <p className="ride-glass rounded-3xl px-4 py-6 text-center text-sm text-white/75">
          Aucun trajet publié dans cette partie du catalogue pour le moment.
        </p>
      ) : null}

      {page && page.routes.length > 0 ? (
        <section
          className="ride-glass-strong rounded-3xl p-2.5"
          aria-labelledby="catalog-results-title"
        >
          <div className="flex items-center justify-between gap-3 px-1.5 pb-2">
            <p id="catalog-results-title" className="shrink-0 text-sm font-semibold">
              {page.total} {page.total === 1 ? "trajet" : "trajets"}
            </p>
            <p className="truncate text-xs text-white/65">
              Touchez un trajet pour l’afficher
            </p>
          </div>
          <ul className="space-y-2" aria-label="Trajets du catalogue">
            {page.routes.map((route) => {
              const selected = selectedSlug === route.slug;
              const loading = loadingSlug === route.slug;

              return (
                <li
                  key={route.slug}
                  className={cn(
                    "rounded-3xl border bg-black/10 p-2.5 shadow-inner transition-colors",
                    selected ? "border-primary/75 bg-primary/10" : "border-white/20",
                  )}
                >
                  <div className="flex gap-3">
                    <RouteThumbnail routeType={route.routeType} />
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="truncate font-semibold tracking-tight">{route.name}</p>
                      <p className="mt-0.5 truncate text-sm text-primary">
                        {route.location.region.name} · {route.location.subdivision.name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-white/80">
                        <RouteMeta
                          icon={RouteIcon}
                          label={formatDistanceLabel(route.distanceKm)}
                        />
                        <RouteMeta
                          icon={Clock3}
                          label={formatDurationLabel(route.durationMinutes)}
                        />
                        <RouteMeta icon={Gauge} label={difficultyLabel(route.difficulty)} />
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-white/70">
                    {route.description}
                  </p>
                  <Button
                    type="button"
                    variant={selected ? "secondary" : "default"}
                    className="mt-2 min-h-12 w-full rounded-2xl text-base"
                    disabled={loadingSlug !== null}
                    onClick={() => void preview(route)}
                  >
                    {loading ? (
                      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                    ) : (
                      <Map aria-hidden="true" className="size-5" />
                    )}
                    {loading
                      ? "Chargement du GPX…"
                      : selected
                        ? "Trajet affiché sur la carte"
                        : "Voir sur la carte"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {selectedSlug ? (
        <Button
          type="button"
          size="lg"
          className="min-h-12 w-full rounded-2xl text-base shadow-lg"
          disabled={navigationActive || loadingSlug !== null}
          onClick={onStartNavigation}
        >
          Démarrer la navigation
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ride"
        className="min-h-12 w-full rounded-2xl text-white/85"
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
  icon: Icon,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  icon: typeof Compass;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={cn(
        "ride-icon-well relative min-h-12 w-full min-w-0 rounded-2xl px-2 transition-shadow focus-within:border-white/60 focus-within:ring-3 focus-within:ring-white/20",
        disabled && "opacity-45",
      )}
    >
      <span className="sr-only">{label}</span>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <select
        className="absolute inset-0 min-h-12 w-full cursor-pointer appearance-none bg-transparent pl-8 pr-6 text-xs font-semibold text-white outline-none disabled:cursor-not-allowed"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-foreground">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-1.5 size-3.5"
      />
    </label>
  );
}

function RouteThumbnail({
  routeType,
}: {
  routeType: RouteCatalogSummary["routeType"];
}) {
  return (
    <div
      aria-hidden="true"
      className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-[radial-gradient(circle_at_65%_30%,rgba(167,243,208,0.35),transparent_25%),linear-gradient(145deg,rgba(255,255,255,0.16),rgba(0,0,0,0.16))]"
    >
      <span className="absolute -left-3 top-3 h-14 w-24 -rotate-[18deg] rounded-[50%] border-2 border-primary/80" />
      <span className="absolute left-5 top-1 h-20 w-12 rotate-[32deg] rounded-[50%] border border-dashed border-white/45" />
      <RouteIcon className="relative z-10 size-7 text-white drop-shadow" />
      <span className="absolute bottom-1.5 rounded-full bg-black/35 px-2 py-0.5 text-[0.625rem] font-semibold">
        {routeType === "loop" ? "Boucle" : "Aller simple"}
      </span>
    </div>
  );
}

function RouteMeta({
  icon: Icon,
  label,
}: {
  icon: typeof Compass;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon aria-hidden="true" className="size-3.5 text-primary" />
      {label}
    </span>
  );
}

function difficultyLabel(value: RouteCatalogSummary["difficulty"]): string {
  if (value === "easy") return "Facile";
  if (value === "challenging") return "Exigeant";
  return "Intermédiaire";
}
