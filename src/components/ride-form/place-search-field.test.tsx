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
});
