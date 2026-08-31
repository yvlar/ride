import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RouteCatalogPage } from "@/domain/route-catalog/types";
import { RouteCatalogPanel } from "./route-catalog-panel";

const regionId = "11111111-1111-4111-8111-111111111111";
const page: RouteCatalogPage = {
  countries: [
    {
      code: "CA",
      slug: "canada",
      name: "Canada",
      routeCount: 1,
      subdivisions: [
        {
          code: "CA-QC",
          slug: "quebec",
          name: "Québec",
          type: "province",
          routeCount: 1,
          regions: [
            {
              id: regionId,
              slug: "estrie",
              name: "Estrie",
              routeCount: 1,
            },
          ],
        },
        {
          code: "CA-ON",
          slug: "ontario",
          name: "Ontario",
          type: "province",
          routeCount: 0,
          regions: [],
        },
      ],
    },
    {
      code: "US",
      slug: "etats-unis",
      name: "États-Unis",
      routeCount: 0,
      subdivisions: [],
    },
  ],
  routes: [
    {
      slug: "boucle-estrie",
      name: "Boucle Estrie",
      description: "Lacs, montagnes et routes sinueuses.",
      routeType: "loop",
      difficulty: "moderate",
      surface: "paved",
      distanceKm: 247.15,
      durationMinutes: 278,
      recommendedDays: { min: 1, max: 1 },
      season: { startMonth: 5, endMonth: 10 },
      start: {
        label: "Roxton Pond",
        coordinates: { latitude: 45.475, longitude: -72.66 },
      },
      end: {
        label: "Roxton Pond",
        coordinates: { latitude: 45.475, longitude: -72.66 },
      },
      tags: ["lakes", "curves"],
      location: {
        country: { code: "CA", slug: "canada", name: "Canada" },
        subdivision: {
          code: "CA-QC",
          slug: "quebec",
          name: "Québec",
          type: "province",
        },
        region: { id: regionId, slug: "estrie", name: "Estrie" },
      },
      gpx: {
        filename: "boucle-estrie.gpx",
        version: 1,
        sha256: "a".repeat(64),
        sizeBytes: 500,
        pointCount: 3,
      },
    },
  ],
  total: 1,
  limit: 100,
  offset: 0,
};

const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Boucle Estrie</name><desc>Une boucle publiée.</desc></metadata>
  <wpt lat="45.475" lon="-72.660"><name>Roxton Pond</name></wpt>
  <trk><name>Boucle Estrie</name><trkseg>
    <trkpt lat="45.475" lon="-72.660" />
    <trkpt lat="45.400" lon="-72.500" />
    <trkpt lat="45.475" lon="-72.660" />
  </trkseg></trk>
</gpx>`;

describe("RouteCatalogPanel", () => {
  it("navigates the hierarchy, previews the remote GPX and starts navigation", async () => {
    const loadCatalog = vi.fn().mockResolvedValue(page);
    const loadGpx = vi.fn().mockResolvedValue({
      filename: "boucle-estrie.gpx",
      xml: gpx,
    });
    const onPreview = vi.fn();
    const onStartNavigation = vi.fn();

    render(
      <RouteCatalogPanel
        loadCatalog={loadCatalog}
        loadGpx={loadGpx}
        onPreview={onPreview}
        onStartNavigation={onStartNavigation}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText("Boucle Estrie")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Pays"), { target: { value: "CA" } });
    await waitFor(() =>
      expect(loadCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ countryCode: "CA" }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Province ou État"), {
      target: { value: "CA-QC" },
    });
    fireEvent.change(screen.getByLabelText("Région"), {
      target: { value: "estrie" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Voir sur la carte" }));
    await waitFor(() =>
      expect(loadGpx).toHaveBeenCalledWith(
        "boucle-estrie",
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1));
    expect(onPreview.mock.calls[0]?.[0]).toMatchObject({
      id: "catalog:boucle-estrie",
      type: "gpx",
      name: "Boucle Estrie",
    });
    expect(onPreview.mock.calls[0]?.[1]).toMatchObject({ type: "gpx" });

    // The list folds away so the previewed trajet is visible on the map.
    expect(
      screen.queryByRole("list", { name: "Trajets du catalogue" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pays")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Démarrer la navigation" }),
    );
    expect(onStartNavigation).toHaveBeenCalledTimes(1);
  });

  it("collapses to the selected trajet and restores the list on Retour", async () => {
    const loadCatalog = vi.fn().mockResolvedValue(page);
    const loadGpx = vi.fn().mockResolvedValue({
      filename: "boucle-estrie.gpx",
      xml: gpx,
    });
    const onPreview = vi.fn();
    const onBack = vi.fn();
    const onCollapsedChange = vi.fn();

    render(
      <RouteCatalogPanel
        loadCatalog={loadCatalog}
        loadGpx={loadGpx}
        onPreview={onPreview}
        onStartNavigation={vi.fn()}
        onBack={onBack}
        onCollapsedChange={onCollapsedChange}
      />,
    );

    expect(await screen.findByText("Boucle Estrie")).toBeInTheDocument();
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Voir sur la carte" }));
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1));

    const card = screen.getByRole("region", {
      name: "Trajet affiché sur la carte",
    });
    expect(card).toHaveTextContent("Boucle Estrie");
    expect(card).toHaveTextContent("Estrie");
    expect(card).toHaveTextContent("Intermédiaire");
    expect(document.activeElement).toBe(card);
    // Looking at one trajet leaves Retour as the only way out of the card.
    expect(
      screen.queryByRole("button", { name: "Fermer" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Retour" }));

    expect(
      screen.getByRole("list", { name: "Trajets du catalogue" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pays")).toBeInTheDocument();
    // Coming back neither refetches the catalogue nor redraws the map.
    expect(loadCatalog).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    // The trajet stays marked as the one on the map.
    expect(
      screen.getByRole("button", { name: "Trajet affiché sur la carte" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Démarrer la navigation" }),
    ).toBeInTheDocument();
    // Back on the list, Fermer takes over from Retour.
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retour" }),
    ).not.toBeInTheDocument();
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps the list visible when the GPX cannot be downloaded", async () => {
    const loadCatalog = vi.fn().mockResolvedValue(page);
    const loadGpx = vi.fn().mockRejectedValue(new Error("GPX introuvable"));
    const onPreview = vi.fn();

    render(
      <RouteCatalogPanel
        loadCatalog={loadCatalog}
        loadGpx={loadGpx}
        onPreview={onPreview}
        onStartNavigation={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText("Boucle Estrie")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voir sur la carte" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("GPX introuvable");
    expect(
      screen.getByRole("list", { name: "Trajets du catalogue" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pays")).toBeInTheDocument();
    expect(onPreview).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Démarrer la navigation" }),
    ).not.toBeInTheDocument();
  });

  it("closes the sheet with Fermer", async () => {
    const onBack = vi.fn();

    render(
      <RouteCatalogPanel
        loadCatalog={vi.fn().mockResolvedValue(page)}
        loadGpx={vi.fn()}
        onPreview={vi.fn()}
        onStartNavigation={vi.fn()}
        onBack={onBack}
      />,
    );

    expect(await screen.findByText("Boucle Estrie")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable error when the catalog cannot be loaded", async () => {
    const loadCatalog = vi.fn().mockRejectedValue(new Error("Service indisponible"));

    render(
      <RouteCatalogPanel
        loadCatalog={loadCatalog}
        loadGpx={vi.fn()}
        onPreview={vi.fn()}
        onStartNavigation={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Service indisponible");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(loadCatalog).toHaveBeenCalledTimes(2));
  });
});
