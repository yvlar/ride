import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CURRENT_POSITION_FALLBACK_LABEL } from "@/infrastructure/geocoding/labels";
import type { Place } from "@/domain/geo/types";
import { CurrentPositionError } from "./browser-geolocation";
import { CURRENT_POSITION_ADDRESS_UNAVAILABLE_MESSAGE } from "./reverse-geocode-place";
import { LocateButton, PlaceSearchField } from "./place-search-field";

const coordinates = { latitude: 45.4001, longitude: -72.7342 };

describe("LocateButton (FR-017)", () => {
  it("does not request the position until the user clicks", () => {
    const requestCoordinates = vi.fn();
    render(
      <LocateButton
        requestCoordinates={requestCoordinates}
        reversePlace={vi.fn()}
        onLocated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Ma position" })).toBeEnabled();
    expect(requestCoordinates).not.toHaveBeenCalled();
  });

  it("shows an accessible loading state and ignores a second click", async () => {
    let resolveCoordinates: (value: typeof coordinates) => void = () => {};
    const requestCoordinates = vi.fn(
      () =>
        new Promise<typeof coordinates>((resolve) => {
          resolveCoordinates = resolve;
        }),
    );
    const reversePlace = vi.fn(async () => ({
      label: "12 Rue Principale, Granby",
      coordinates,
    }));

    render(
      <LocateButton
        requestCoordinates={requestCoordinates}
        reversePlace={reversePlace}
        onLocated={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ma position" }));
    fireEvent.click(screen.getByRole("button", { name: "Localisation…" }));

    const loading = screen.getByRole("button", { name: "Localisation…" });
    expect(loading).toBeDisabled();
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(requestCoordinates).toHaveBeenCalledTimes(1);

    resolveCoordinates(coordinates);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ma position" })).toBeEnabled();
    });
  });

  it("surfaces unsupported, denied, unavailable and timeout errors", async () => {
    const cases = [
      "unsupported",
      "permission_denied",
      "position_unavailable",
      "timeout",
    ] as const;

    for (const reason of cases) {
      const onError = vi.fn();
      const { unmount } = render(
        <LocateButton
          requestCoordinates={async () => {
            throw new CurrentPositionError(reason);
          }}
          reversePlace={vi.fn()}
          onLocated={vi.fn()}
          onError={onError}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Ma position" }));
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          new CurrentPositionError(reason).message,
        );
      });
      unmount();
    }
  });

  it("uses the reverse-geocoded address with the exact GPS coordinates", async () => {
    const onLocated = vi.fn();
    render(
      <LocateButton
        requestCoordinates={async () => coordinates}
        reversePlace={async () => ({
          label: "12 Rue Principale, Granby",
          coordinates: { latitude: 0, longitude: 0 },
        })}
        onLocated={onLocated}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ma position" }));

    await waitFor(() => {
      expect(onLocated).toHaveBeenCalledWith({
        label: "12 Rue Principale, Granby",
        coordinates,
      });
    });
  });

  it("falls back to the current-position label when reverse geocoding fails", async () => {
    const onLocated = vi.fn();
    render(
      <LocateButton
        requestCoordinates={async () => coordinates}
        reversePlace={async () => {
          throw new Error("unavailable");
        }}
        onLocated={onLocated}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ma position" }));

    await waitFor(() => {
      expect(onLocated).toHaveBeenCalledWith(
        {
          label: CURRENT_POSITION_FALLBACK_LABEL,
          coordinates,
        },
        CURRENT_POSITION_ADDRESS_UNAVAILABLE_MESSAGE,
      );
    });
  });
});

const granby: Place = {
  label: "Granby, QC",
  name: "Granby",
  locality: "Granby",
  region: "QC",
  coordinates: { latitude: 45.4, longitude: -72.73 },
};

const fieldProps = {
  id: "place",
  label: "Lieu",
  selectedPlace: null,
  debounceMs: 0,
  onQueryChange: () => {},
  onPlaceSelected: () => {},
};

describe("PlaceSearchField (FR-032)", () => {
  it("aborts the previous in-flight search when the query changes", async () => {
    const signals: AbortSignal[] = [];
    const searchPlaces = vi.fn((query: string, signal?: AbortSignal) => {
      if (signal) {
        signals.push(signal);
      }
      if (query === "Gra") {
        return new Promise<Place[]>(() => {
          // Stay pending so a newer query can cancel it.
        });
      }
      return Promise.resolve([granby]);
    });

    const { rerender } = render(
      <PlaceSearchField {...fieldProps} query="Gra" searchPlaces={searchPlaces} />,
    );

    await waitFor(() => {
      expect(searchPlaces).toHaveBeenCalled();
    });

    rerender(
      <PlaceSearchField
        {...fieldProps}
        query="Gran"
        searchPlaces={searchPlaces}
      />,
    );

    await waitFor(() => {
      expect(searchPlaces.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(signals[0]?.aborted).toBe(true);
  });

  it("shows a name and a distinguishing address line", async () => {
    render(
      <PlaceSearchField
        {...fieldProps}
        query="Granby"
        searchPlaces={async () => [granby]}
      />,
    );

    expect(await screen.findByText("Granby")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Granby, QC" }),
    ).toBeInTheDocument();
  });
  it("never lets a slow answer replace a newer query (FR-032)", async () => {
    const resolvers: Array<(places: Place[]) => void> = [];
    const searchPlaces = vi.fn(
      () =>
        new Promise<Place[]>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { rerender } = render(
      <PlaceSearchField
        {...fieldProps}
        query="Gra"
        searchPlaces={searchPlaces}
      />,
    );
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(1));

    rerender(
      <PlaceSearchField
        {...fieldProps}
        query="Magog"
        searchPlaces={searchPlaces}
      />,
    );
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledTimes(2));

    // The first request answers last; it must not paint stale results.
    resolvers[0]?.([
      { label: "Granby, QC", coordinates: { latitude: 45.4, longitude: -72.7 } },
    ]);
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: "Granby, QC" })).toBeNull();
    });

    resolvers[1]?.([
      { label: "Magog, QC", coordinates: { latitude: 45.26, longitude: -72.14 } },
    ]);
    expect(
      await screen.findByRole("option", { name: "Magog, QC" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Granby, QC" })).toBeNull();
  });

  it("never preselects an ambiguous first result (FR-032)", async () => {
    const searchPlaces = vi.fn(async (): Promise<Place[]> => [
      {
        label: "Granby, Québec, Canada",
        name: "Granby",
        region: "Québec",
        country: "Canada",
        coordinates: { latitude: 45.4001, longitude: -72.7342 },
      },
      {
        label: "Granby, Colorado, États-Unis",
        name: "Granby",
        region: "Colorado",
        country: "États-Unis",
        coordinates: { latitude: 40.0866, longitude: -105.9372 },
      },
    ]);
    const onPlaceSelected = vi.fn();
    render(
      <PlaceSearchField
        {...fieldProps}
        query="Granby"
        searchPlaces={searchPlaces}
        onPlaceSelected={onPlaceSelected}
      />,
    );

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }
    expect(onPlaceSelected).not.toHaveBeenCalled();
  });

  it("navigates results with the keyboard and commits with Enter (NFR-001)", async () => {
    const searchPlaces = vi.fn(async (): Promise<Place[]> => [
      { label: "Granby, QC", coordinates: { latitude: 45.4, longitude: -72.73 } },
      { label: "Magog, QC", coordinates: { latitude: 45.26, longitude: -72.14 } },
    ]);
    const onPlaceSelected = vi.fn();
    render(
      <PlaceSearchField
        {...fieldProps}
        query="QC"
        searchPlaces={searchPlaces}
        onPlaceSelected={onPlaceSelected}
      />,
    );
    await screen.findAllByRole("option");
    const combobox = screen.getByRole("combobox", { name: "Lieu" });

    // Enter before moving must not commit anything.
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(onPlaceSelected).not.toHaveBeenCalled();

    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(combobox).toHaveAttribute(
      "aria-activedescendant",
      "place-suggestions-option-0",
    );
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(combobox).toHaveAttribute(
      "aria-activedescendant",
      "place-suggestions-option-1",
    );
    fireEvent.keyDown(combobox, { key: "ArrowUp" });
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(onPlaceSelected).toHaveBeenCalledTimes(1);
    expect(onPlaceSelected.mock.calls[0]?.[0]?.label).toBe("Granby, QC");
  });

  it("offers a retry after a network failure (FR-032)", async () => {
    const searchPlaces = vi
      .fn<(query: string, signal?: AbortSignal) => Promise<Place[]>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce([
        { label: "Magog, QC", coordinates: { latitude: 45.26, longitude: -72.14 } },
      ]);
    render(
      <PlaceSearchField
        {...fieldProps}
        query="Magog"
        searchPlaces={searchPlaces}
      />,
    );

    expect(
      await screen.findByText(/Pas de réseau/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(
      await screen.findByRole("option", { name: "Magog, QC" }),
    ).toBeInTheDocument();
    expect(searchPlaces).toHaveBeenCalledTimes(2);
  });

  it("labels each result with its destination type (FR-038)", async () => {
    const searchPlaces = vi.fn(async (): Promise<Place[]> => [
      {
        label: "J2G 2W4, Granby, Québec, Canada",
        name: "J2G 2W4",
        locality: "Granby",
        region: "Québec",
        country: "Canada",
        kind: "postal_code",
        precision: "approximate",
        coordinates: { latitude: 45.4004, longitude: -72.7325 },
      },
    ]);
    render(
      <PlaceSearchField
        {...fieldProps}
        query="J2G 2W4"
        searchPlaces={searchPlaces}
      />,
    );

    const option = await screen.findByRole("option");
    expect(option).toHaveTextContent("J2G 2W4");
    expect(option).toHaveTextContent("Code postal");
    expect(option).toHaveTextContent("Granby");
    expect(option).toHaveTextContent("Canada");
  });
});
